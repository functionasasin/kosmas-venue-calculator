import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { Item } from '@/calculator/types'
import type { StoredLine } from '@/data/venueLines'
import type { RoleKey } from '@/calculator/roleKeys'
import { MaterialsTable } from './MaterialsTable'

// `name: string` is explicit on purpose. `name = roleKey` would infer the
// RoleKey union and every call passing a real display name would be a TS2345 —
// invisible to vitest, which strips types, but fatal to `npm run build`.
export const item = (
  roleKey: RoleKey, category: string, name: string = roleKey,
): Item => ({
  id: `id-${roleKey}`, name, category, roleKey,
  supplier: null, poeWatts: null, mainsWatts: null, rackU: null,
  isActive: true, isDefault: true, notes: null, printNote: null,
})

export const line = (
  roleKey: RoleKey, qty: StoredLine['qty'],
  over: Partial<StoredLine> = {},
): StoredLine => ({
  id: `line-${roleKey}`, venueId: 'v', itemId: `id-${roleKey}`,
  roleKey, qty, originRoleKey: null, sortOrder: 0,
  source: 'formula', suppressed: false, note: null, ...over,
})

// The swap picker is a Base UI Select, not a native <select>: the trigger is a
// button and the options exist only inside a portal while the popup is open, so
// a swap is driven the way a user performs one — open, then click the item —
// rather than by firing `change` at the element.
//
// Two things here are load-bearing and were both found by probing the real
// component, because both fail silently rather than erroring:
//
// 1. Opening is a plain click. Sending pointerdown first puts Base UI into a
//    press state that swallows the click, and the popup never opens.
// 2. An item commits only once it is highlighted, so a click must be preceded
//    by a mousemove onto it — which is what a pointer user actually does. A
//    bare click on an unhighlighted item is ignored and onValueChange never
//    fires, leaving a green-looking test that asserts nothing.
const openSwapPicker = (index = 0) => {
  fireEvent.click(screen.getAllByRole('combobox')[index])
  const popup = document.querySelector('[data-slot="select-content"]')
  if (!popup) throw new Error('swap picker did not open')
  return within(popup as HTMLElement)
}

// Scoped to the popup on purpose. A document-wide getAllByRole('option') also
// matches the Add-line native <select>'s <option>s, which made an earlier
// version of the cable-leak test below pass while asserting on the wrong
// control entirely.
const swapOptionNames = (index = 0) =>
  openSwapPicker(index).getAllByRole('option').map(o => o.textContent?.trim() ?? '')

const swapTo = (name: string | RegExp, index = 0) => {
  const option = openSwapPicker(index).getByRole('option', { name })
  fireEvent.mouseMove(option)
  fireEvent.click(option)
}

const catalog: Item[] = [
  item('display', 'court', 'Samsung 65in'),
  item('ipad', 'court', 'iPad A16'),
  // Two UPS rungs, because the swap picker is now constrained to a line's role
  // FAMILY and a rung is the everyday cross-role swap that survives that: a
  // display and an iPad are different families and can no longer be swapped
  // for one another, so they cannot carry the originRoleKey tests below.
  item('ups_1500va', 'power', 'UPS 1500 VA'),
  item('ups_3000va', 'power', 'UPS 3000 VA'),
]

describe('swapping an item', () => {
  // itemId is what exportMaterials resolves first and what saveVenueAndLines writes.
  // Leaving it stale makes the PDF print the item the user swapped away from.
  it('rewrites itemId along with roleKey', () => {
    const onChange = vi.fn()
    render(
      <MaterialsTable
        lines={[line('ups_1500va', 1)]}
        catalog={catalog}
        formulas={new Map()}
        onChange={onChange}
        isAdmin
      />,
    )

    swapTo('UPS 3000 VA')

    const [updated] = onChange.mock.calls[0][0] as StoredLine[]
    expect(updated.roleKey).toBe('ups_3000va')
    expect(updated.itemId).toBe('id-ups_3000va')
    expect(updated.originRoleKey).toBe('ups_1500va')
    expect(updated.source).toBe('manual')
  })

  // originRoleKey records the role the line vacated and must be written once.
  // A second swap overwriting it would let recalculation re-add the original
  // underneath the swapped line.
  it('does not overwrite originRoleKey on a second swap', () => {
    const onChange = vi.fn()
    render(
      <MaterialsTable
        lines={[line('ups_1500va', 1, {
          originRoleKey: 'ups_750va', source: 'manual',
        })]}
        catalog={catalog}
        formulas={new Map()}
        onChange={onChange}
        isAdmin
      />,
    )

    swapTo('UPS 3000 VA')

    const [updated] = onChange.mock.calls[0][0] as StoredLine[]
    expect(updated.originRoleKey).toBe('ups_750va')
  })
})

describe('sections', () => {
  const sectioned: Item[] = [
    item('display', 'court', 'Samsung 65in'),
    item('ipad', 'court', 'iPad A16'),
    item('ups_1500va', 'power', 'UPS 1500 VA'),
    item('cat6_0m5', 'cable', 'Vention Cat6 0.5M'),
    item('access_point', 'network', 'UniFi U7-LR'),
  ]

  const mixed: StoredLine[] = [
    line('ups_1500va', 1), line('display', 8), line('cat6_0m5', 26),
    line('access_point', 'TBD'),
  ]

  it('renders a header per non-empty section, in order', () => {
    render(
      <MaterialsTable lines={mixed} catalog={sectioned} isAdmin
        formulas={new Map()} onChange={vi.fn()} />,
    )
    const headers = screen.getAllByTestId('section-header').map(h => h.textContent)
    expect(headers).toEqual([
      expect.stringContaining('Rack'),
      expect.stringContaining('Court-side'),
      expect.stringContaining('Cabling'),
      expect.stringContaining('Needs a decision'),
    ])
  })

  it('shows the visible line count in each header', () => {
    render(
      <MaterialsTable lines={mixed} catalog={sectioned} isAdmin
        formulas={new Map()} onChange={vi.fn()} />,
    )
    expect(screen.getByTestId('section-header-rack').textContent).toContain('1')
  })

  // Suppressed lines belong to the removed-lines list, not to a section count.
  it('excludes suppressed lines from a section and its count', () => {
    const withRemoved = [...mixed, line('ipad', 8, { suppressed: true })]
    render(
      <MaterialsTable lines={withRemoved} catalog={sectioned} isAdmin
        formulas={new Map()} onChange={vi.fn()} />,
    )
    expect(screen.getByTestId('section-header-court').textContent).toContain('1')
    expect(screen.getByText(/Removed lines/i)).toBeInTheDocument()
  })

  it('renders no section headers for a venue with no lines', () => {
    render(
      <MaterialsTable lines={[]} catalog={sectioned} isAdmin
        formulas={new Map()} onChange={vi.fn()} />,
    )
    expect(screen.queryAllByTestId('section-header')).toHaveLength(0)
  })
})

describe('resolving a TBD line', () => {
  const sectioned: Item[] = [
    item('access_point', 'network', 'UniFi U7-LR'),
    item('ups_1500va', 'power', 'UPS 1500 VA'),
  ]

  // Without an affordance the amber section can never be emptied, which makes
  // "resolve before ordering" advice the app itself refuses to accept.
  it('lets a TBD quantity be replaced with a number', () => {
    const onChange = vi.fn()
    render(
      <MaterialsTable lines={[line('access_point', 'TBD')]} catalog={sectioned} isAdmin
        formulas={new Map()} onChange={onChange} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'TBD' }))
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } })
    fireEvent.blur(screen.getByRole('spinbutton'))

    const [updated] = onChange.mock.calls[0][0] as StoredLine[]
    expect(updated.qty).toBe(3)
    expect(updated.source).toBe('manual')
  })

  // A resolved TBD is ordinary gear again and belongs with its own kind. Drives
  // the real resolve affordance (click TBD, type, commit) rather than rendering
  // an already-resolved line directly — a fixture with qty: 4 from the start
  // would pass even with the TBD button deleted entirely, and duplicates what
  // sections.test.ts already covers. This is the test that would have caught
  // the qty field committing on every keystroke and re-parenting the row.
  it('moves the line out of Needs a decision once it has a number', () => {
    function Harness() {
      const [ls, setLs] = useState<StoredLine[]>([line('access_point', 'TBD')])
      return (
        <MaterialsTable lines={ls} catalog={sectioned} isAdmin
          formulas={new Map()} onChange={setLs} />
      )
    }
    render(<Harness />)

    expect(screen.getByTestId('section-header-decide')).toBeInTheDocument()
    expect(screen.queryByTestId('section-header-rack')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'TBD' }))
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '4' } })
    fireEvent.blur(screen.getByRole('spinbutton'))

    expect(screen.getByTestId('section-header-rack')).toBeInTheDocument()
    expect(screen.queryByTestId('section-header-decide')).not.toBeInTheDocument()
  })
})

describe('quantity commits on blur, not on every keystroke', () => {
  const sectioned: Item[] = [
    item('access_point', 'network', 'UniFi U7-LR'),
    item('ups_1500va', 'power', 'UPS 1500 VA'),
  ]

  // Pins the blur-commit design itself: if this reverts to committing on
  // every keystroke, N1's fix (a no-op guard in commitQty) has nothing left
  // to guard and the backspace-to-TBD / digit-swallowing bugs it replaced
  // can silently come back.
  it('does not commit while typing, before any blur', () => {
    const onChange = vi.fn()
    render(
      <MaterialsTable lines={[line('ups_1500va', 1)]} catalog={sectioned} isAdmin
        formulas={new Map()} onChange={onChange} />,
    )

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '5' } })

    expect(onChange).not.toHaveBeenCalled()
  })

  // A reviewer tabbing through quantities without typing must not touch the
  // line. Otherwise every field they pass through flips 'formula' to
  // 'manual', and mergeRecalculation's manual-line short-circuit then treats
  // an untouched line as a deliberate correction — a later Recalculate
  // reports "nothing would change" for it and the printed BOM under-orders.
  it('does not commit a blur with no typing', () => {
    const onChange = vi.fn()
    render(
      <MaterialsTable lines={[line('ups_1500va', 1)]} catalog={sectioned} isAdmin
        formulas={new Map()} onChange={onChange} />,
    )

    const input = screen.getByRole('spinbutton')
    fireEvent.focus(input)
    fireEvent.blur(input)

    expect(onChange).not.toHaveBeenCalled()
  })

  // Same consequence as above, via the other path into commitQty: clicking
  // TBD to look at the resolve field and blurring without typing must leave
  // the line at 'TBD' with source untouched, not stamp it 'manual'.
  it('does not commit clicking TBD and blurring without typing', () => {
    const onChange = vi.fn()
    render(
      <MaterialsTable lines={[line('access_point', 'TBD')]} catalog={sectioned} isAdmin
        formulas={new Map()} onChange={onChange} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'TBD' }))
    fireEvent.blur(screen.getByRole('spinbutton'))

    expect(onChange).not.toHaveBeenCalled()
  })

  // Proves the no-op guard didn't over-fire: a genuine edit must still reach
  // onUpdate on blur and still mark the line manual, the behaviour the guard
  // is protecting rather than disabling.
  it('commits a real edit on blur and marks the line manual', () => {
    const onChange = vi.fn()
    render(
      <MaterialsTable lines={[line('ups_1500va', 1)]} catalog={sectioned} isAdmin
        formulas={new Map()} onChange={onChange} />,
    )

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '5' } })
    fireEvent.blur(screen.getByRole('spinbutton'))

    const [updated] = onChange.mock.calls[0][0] as StoredLine[]
    expect(updated.qty).toBe(5)
    expect(updated.source).toBe('manual')
  })
})

describe('cabling is admin-only', () => {
  const sectioned: Item[] = [
    item('ups_1500va', 'power', 'UPS 1500 VA'),
    item('cat6_0m5', 'cable', 'Vention Cat6 0.5M'),
    item('cat6_1m', 'cable', 'Vention Cat6 1M'),
  ]

  const withCable: StoredLine[] = [
    line('ups_1500va', 1), line('cat6_0m5', 26), line('cat6_1m', 2),
  ]

  it('shows the Cabling section to an admin', () => {
    render(
      <MaterialsTable lines={withCable} catalog={sectioned} isAdmin
        formulas={new Map()} onChange={vi.fn()} />,
    )
    expect(screen.getByTestId('section-header-cabling')).toBeInTheDocument()
  })

  it('hides it from a user', () => {
    render(
      <MaterialsTable lines={withCable} catalog={sectioned} isAdmin={false}
        formulas={new Map()} onChange={vi.fn()} />,
    )
    expect(screen.queryByTestId('section-header-cabling')).not.toBeInTheDocument()
    expect(screen.queryByText('Vention Cat6 0.5M')).not.toBeInTheDocument()
  })

  // Otherwise a user sees "Vention Cat6 0.5M — Restore" in the removed list.
  it('keeps a suppressed cable line out of the removed-lines list for a user', () => {
    const suppressed = [line('ups_1500va', 1), line('cat6_0m5', 26, { suppressed: true })]
    render(
      <MaterialsTable lines={suppressed} catalog={sectioned} isAdmin={false}
        formulas={new Map()} onChange={vi.fn()} />,
    )
    expect(screen.queryByText(/Removed lines/i)).not.toBeInTheDocument()
  })

  // Otherwise a user can add a cable line that then vanishes with no feedback.
  it('keeps cable items out of the Add-line picker for a user', () => {
    render(
      <MaterialsTable lines={[line('ups_1500va', 1)]} catalog={sectioned} isAdmin={false}
        formulas={new Map()} onChange={vi.fn()} />,
    )
    const options = Array.from(
      (screen.getByLabelText('Add line') as HTMLSelectElement).options,
    ).map(o => o.value)
    expect(options).toContain('id-ups_1500va')
    expect(options).not.toContain('id-cat6_0m5')
  })

  // THE data-loss guard. save_venue deletes every row for the venue and
  // re-inserts only what it is given, in one transaction, so a filtered array
  // reaching onChange permanently deletes the hidden cable rows — silently,
  // and only on venues a non-admin happened to edit.
  it('returns hidden cable lines in onChange when a user edits another line', () => {
    const onChange = vi.fn()
    render(
      <MaterialsTable lines={withCable} catalog={sectioned} isAdmin={false}
        formulas={new Map()} onChange={onChange} />,
    )

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } })
    fireEvent.blur(screen.getByRole('spinbutton'))

    const payload = onChange.mock.calls[0][0] as StoredLine[]
    expect(payload).toHaveLength(3)
    expect(payload.map(l => l.roleKey).sort())
      .toEqual(['cat6_0m5', 'cat6_1m', 'ups_1500va'])
  })

  // swapOptionsFor deliberately falls back to the whole active catalog when a
  // line's item doesn't resolve, so an unrepairable line stays repairable —
  // that fallback is correct and must keep the row itself visible. But the
  // fallback combined with no filtering would print cable item names into the
  // swap picker for a user, on a line that isn't even hidden.
  it('keeps cable items out of the swap picker for an unresolvable line as a user', () => {
    const unresolved = [line('display', 8)]
    render(
      <MaterialsTable lines={unresolved} catalog={sectioned} isAdmin={false}
        formulas={new Map()} onChange={vi.fn()} />,
    )

    expect(screen.getByText(/No active item mapped for display/)).toBeInTheDocument()

    // Derived from the catalog rather than hardcoded: the guard is "no cable
    // item, whichever they are", so adding one to the fixture must extend the
    // assertion automatically instead of silently going untested.
    const cableNames = sectioned.filter(i => i.category === 'cable').map(i => i.name)
    expect(cableNames.length).toBeGreaterThan(0)

    const offered = swapOptionNames()
    for (const name of cableNames) expect(offered).not.toContain(name)
    expect(offered).toContain('UPS 1500 VA')
  })
})

/**
 * A role whose every item has been deactivated. mergeRecalculation mints the
 * line with an EMPTY itemId — "this role resolved to nothing" — and the row
 * has to say so.
 *
 * Falling through to the role lookup instead names a deactivated candidate,
 * and with more than one of them the one shown is arbitrary: itemsByRole is
 * built from the whole catalog with no active filter, and `chosen` holds no
 * entry for a role with no active winner, so it is first-wins. That is the
 * same arbitrary resolution resolveCatalog exists to prevent, and it printed a
 * SKU nobody chose on the row for a line the engine sized at zero watts.
 * buildPdfBody already drops these lines; this is the screen catching up.
 */
describe('a line that resolves to no item', () => {
  const deactivated = (id: string, name: string): Item => ({
    ...item('replay_camera', 'camera', name), id, isActive: false,
  })
  const cameras = [
    deactivated('dah', 'Dahua 5459T'),
    deactivated('uni', 'Uniview Owlview'),
  ]
  const unresolved = line('replay_camera', 14, {
    id: 'new:replay_camera', itemId: '',
  })

  it('names no item at all rather than an arbitrary deactivated one', () => {
    render(
      <MaterialsTable lines={[unresolved]} catalog={[...cameras, ...catalog]}
        formulas={new Map()} onChange={vi.fn()} isAdmin />,
    )
    expect(screen.getByText(/No active item mapped for replay_camera/))
      .toBeInTheDocument()
    expect(screen.queryByText(/Dahua/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Uniview/)).not.toBeInTheDocument()
  })

  // The line still has to be repairable — that is what the swap control is
  // for — so dropping the name must not drop the row or its picker.
  it('still offers the swap control that repairs it', () => {
    render(
      <MaterialsTable lines={[unresolved]} catalog={[...cameras, ...catalog]}
        formulas={new Map()} onChange={vi.fn()} isAdmin />,
    )
    expect(swapOptionNames()).toContain('iPad A16')
  })

  /**
   * The Removed-lines list resolved items with its own copy of the
   * itemId-then-role chain and never got the empty-itemId guard its two
   * siblings have, so a removed line that maps to nothing named an arbitrary
   * deactivated candidate here while the row above it said "No active item
   * mapped". All three now go through resolveLineItem.
   */
  it('names no item in the Removed-lines list either', () => {
    render(
      <MaterialsTable
        lines={[{ ...unresolved, suppressed: true }]}
        catalog={[...cameras, ...catalog]}
        formulas={new Map()} onChange={vi.fn()} isAdmin />,
    )
    expect(screen.getByText(/Removed lines/)).toBeInTheDocument()
    expect(screen.queryByText('Dahua 5459T')).not.toBeInTheDocument()
    expect(screen.queryByText('Uniview Owlview')).not.toBeInTheDocument()
    // Falls back to the role key, the same as the row does.
    expect(screen.getByText('replay_camera')).toBeInTheDocument()
  })

  // A line whose itemId points at a row that IS in the catalog keeps naming
  // it, deactivated or not: that is a real pointer to a real item, and the
  // "(inactive)" badge is how a saved line survives its item being retired.
  it('still names a deactivated item the line actually points at', () => {
    render(
      <MaterialsTable
        lines={[line('replay_camera', 14, { itemId: 'dah' })]}
        catalog={[...cameras, ...catalog]}
        formulas={new Map()} onChange={vi.fn()} isAdmin />,
    )
    expect(screen.getByText(/Dahua 5459T \(inactive\)/)).toBeInTheDocument()
  })
})

describe('two active items on one role', () => {
  // NOTE: this fixture is deliberately NOT run through resolveCatalog. The
  // component is given the whole catalog on purpose — the swap control's job
  // is to offer the alternate — so the test must mirror that or it would be
  // asserting a state the app never reaches.
  const cameras = [
    ...catalog.filter(i => i.roleKey !== 'replay_camera'),
    { ...item('replay_camera', 'camera'), id: 'uni', name: 'Uniview' },
    { ...item('replay_camera', 'camera'), id: 'dah', name: 'Dahua' },
  ]

  // The swap picker used to key on role key, so two cameras rendered two
  // options with the SAME value and the handler resolved through a role map —
  // last wins. Picking either one landed on whichever came back last from the
  // query, silently, and that item went onto the saved line and the PDF.
  it('offers both cameras as distinct options and swaps to the one picked', async () => {
    const onChange = vi.fn()
    render(
      <MaterialsTable
        lines={[line('replay_camera', 8, { itemId: 'uni' })]}
        catalog={cameras}
        formulas={new Map()}
        onChange={onChange}
        isAdmin
      />,
    )

    const popup = openSwapPicker()
    expect(popup.getAllByRole('option').map(o => o.textContent?.trim()))
      .toEqual(expect.arrayContaining(['Uniview', 'Dahua']))

    const dahua = popup.getByRole('option', { name: 'Dahua' })
    fireEvent.mouseMove(dahua)
    fireEvent.click(dahua)

    expect(onChange.mock.calls[0][0][0]).toMatchObject({
      itemId: 'dah', roleKey: 'replay_camera', source: 'manual',
    })
  })

  // originRoleKey records the role a line VACATED. Swapping between two items
  // that hold the SAME role vacates nothing, and stamping it would put the role
  // into mergeRecalculation's `present` set twice — which is how a swapped line
  // stops the vacated role being re-added, a behaviour that must not fire here.
  it('does not set originRoleKey when the swap stays inside the role', async () => {
    const onChange = vi.fn()
    render(
      <MaterialsTable
        lines={[line('replay_camera', 8, { itemId: 'uni' })]}
        catalog={cameras}
        formulas={new Map()}
        onChange={onChange}
        isAdmin
      />,
    )

    swapTo('Dahua')

    expect(onChange.mock.calls[0][0][0].originRoleKey).toBeNull()
  })

  // The other half of the contrast above. A swap ACROSS roles still stamps
  // originRoleKey — it just has to stay inside the role family now, which the
  // UPS rungs are: five roles, one family, and swapping between them is the
  // reason cross-role swap survives the picker being narrowed at all.
  it('still sets originRoleKey when the swap crosses to another role', async () => {
    const onChange = vi.fn()
    render(
      <MaterialsTable
        lines={[line('ups_1500va', 1)]}
        catalog={cameras}
        formulas={new Map()}
        onChange={onChange}
        isAdmin
      />,
    )

    swapTo('UPS 3000 VA')

    expect(onChange.mock.calls[0][0][0]).toMatchObject({
      roleKey: 'ups_3000va', originRoleKey: 'ups_1500va',
    })
  })
})

/**
 * On a stock Pro venue roughly half the lines have exactly one active item in
 * their role family — the Mac mini, the iPad, the Apple TV, the display, the
 * Flic, the signage, the access point. A Select there opens a popup holding
 * the item already shown, so the chevron promises a choice that does not
 * exist. Rendering those as text is what makes the chevron mean something:
 * "there is a real alternative here".
 */
describe('a row with nothing to choose', () => {
  const swapPicker = () =>
    screen.queryByRole('combobox', { name: /^Swap item/ })

  it('renders the item name as text when the family has one active item', () => {
    render(
      <MaterialsTable lines={[line('display', 8)]} catalog={catalog} isAdmin
        formulas={new Map()} onChange={vi.fn()} />,
    )
    // Scoped to the row: the Add-line <select> below the table carries an
    // <option> with the same text, which a document-wide query also matches.
    const row = screen.getAllByRole('row').at(-1)!
    expect(within(row).getByText('Samsung 65in')).toBeInTheDocument()
    expect(swapPicker()).toBeNull()
  })

  it('keeps the picker when the family holds a real alternative', () => {
    render(
      <MaterialsTable lines={[line('ups_1500va', 1)]} catalog={catalog} isAdmin
        formulas={new Map()} onChange={vi.fn()} />,
    )
    expect(swapPicker()).toBeInTheDocument()
    expect(swapOptionNames()).toEqual(
      expect.arrayContaining(['UPS 1500 VA', 'UPS 3000 VA']))
  })

  // The current item counts even when it is deactivated: it is appended to the
  // options as the "(inactive)" fallback, so a retired item plus one active
  // replacement is a genuine choice and must keep its picker.
  it('keeps the picker for a deactivated item that has a live replacement', () => {
    const retired = catalog.map(i =>
      i.roleKey === 'display' ? { ...i, isActive: false } : i)
    const replacement = { ...item('display', 'court', 'LG 65in'), id: 'lg' }
    render(
      <MaterialsTable lines={[line('display', 8)]} catalog={[...retired, replacement]}
        isAdmin formulas={new Map()} onChange={vi.fn()} />,
    )
    expect(swapPicker()).toBeInTheDocument()
    expect(swapOptionNames()).toEqual(
      expect.arrayContaining(['LG 65in', 'Samsung 65in (inactive)']))
  })

  // The phone affordance is a native <select> in the actions dialog rather
  // than the Base UI popup, and it has to follow the same rule — an earlier
  // divergence between these two controls is why they share one options array.
  it('drops the select from the actions dialog too', () => {
    render(
      <MaterialsTable lines={[line('display', 8)]} catalog={catalog} isAdmin
        formulas={new Map()} onChange={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /actions/i }))
    expect(screen.queryByRole('combobox', { name: /^Swap item/ })).toBeNull()
    expect(screen.getAllByText('Samsung 65in').length).toBeGreaterThan(0)
  })
})

describe('the row actions control', () => {
  const sectioned: Item[] = [
    item('display', 'court', 'Samsung 65in'),
    item('ipad', 'court', 'iPad A16'),
  ]

  // jsdom has no viewport, so this asserts the control exists and works, not
  // which breakpoint reveals it. The breakpoint is checked by eye in Step 6.
  it('removes a line from the actions dialog', () => {
    const onChange = vi.fn()
    render(
      <MaterialsTable lines={[line('display', 8)]} catalog={sectioned} isAdmin
        formulas={new Map()} onChange={onChange} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /actions/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove line' }))

    const [updated] = onChange.mock.calls[0][0] as StoredLine[]
    expect(updated.suppressed).toBe(true)
  })
})
