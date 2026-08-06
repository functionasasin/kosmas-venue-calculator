import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
  supplier: null, poeWatts: null, rackU: null, unitPrice: null,
  currency: null, isActive: true, notes: null, printNote: null,
})

export const line = (
  roleKey: RoleKey, qty: StoredLine['qty'],
  over: Partial<StoredLine> = {},
): StoredLine => ({
  id: `line-${roleKey}`, venueId: 'v', itemId: `id-${roleKey}`,
  roleKey, qty, originRoleKey: null, sortOrder: 0,
  source: 'formula', suppressed: false, note: null, ...over,
})

const catalog: Item[] = [
  item('display', 'court', 'Samsung 65in'),
  item('ipad', 'court', 'iPad A16'),
  item('ups', 'power', 'KSTAR UPS'),
]

describe('swapping an item', () => {
  // itemId is what exportMaterials resolves first and what saveLines writes.
  // Leaving it stale makes the PDF print the item the user swapped away from.
  it('rewrites itemId along with roleKey', () => {
    const onChange = vi.fn()
    render(
      <MaterialsTable
        lines={[line('display', 8)]}
        catalog={catalog}
        formulas={new Map()}
        onChange={onChange}
        isAdmin
      />,
    )

    fireEvent.change(screen.getAllByRole('combobox')[0], {
      target: { value: 'ipad' },
    })

    const [updated] = onChange.mock.calls[0][0] as StoredLine[]
    expect(updated.roleKey).toBe('ipad')
    expect(updated.itemId).toBe('id-ipad')
    expect(updated.originRoleKey).toBe('display')
    expect(updated.source).toBe('manual')
  })

  // originRoleKey records the role the line vacated and must be written once.
  // A second swap overwriting it would let recalculation re-add the original
  // underneath the swapped line.
  it('does not overwrite originRoleKey on a second swap', () => {
    const onChange = vi.fn()
    render(
      <MaterialsTable
        lines={[line('ipad', 8, { originRoleKey: 'display', source: 'manual' })]}
        catalog={catalog}
        formulas={new Map()}
        onChange={onChange}
        isAdmin
      />,
    )

    fireEvent.change(screen.getAllByRole('combobox')[0], {
      target: { value: 'display' },
    })

    const [updated] = onChange.mock.calls[0][0] as StoredLine[]
    expect(updated.originRoleKey).toBe('display')
  })
})

describe('sections', () => {
  const sectioned: Item[] = [
    item('display', 'court', 'Samsung 65in'),
    item('ipad', 'court', 'iPad A16'),
    item('ups', 'power', 'KSTAR UPS'),
    item('cat6_0m5', 'cable', 'Vention Cat6 0.5M'),
    item('access_point', 'network', 'UniFi U7-LR'),
  ]

  const mixed: StoredLine[] = [
    line('ups', 1), line('display', 8), line('cat6_0m5', 26),
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
    item('ups', 'power', 'KSTAR UPS'),
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

    const [updated] = onChange.mock.calls[0][0] as StoredLine[]
    expect(updated.qty).toBe(3)
    expect(updated.source).toBe('manual')
  })

  // A resolved TBD is ordinary gear again and belongs with its own kind.
  it('moves the line out of Needs a decision once it has a number', () => {
    render(
      <MaterialsTable lines={[line('access_point', 4)]} catalog={sectioned} isAdmin
        formulas={new Map()} onChange={vi.fn()} />,
    )
    expect(screen.getByTestId('section-header-rack')).toBeInTheDocument()
    expect(screen.queryByTestId('section-header-decide')).not.toBeInTheDocument()
  })
})

describe('cabling is admin-only', () => {
  const sectioned: Item[] = [
    item('ups', 'power', 'KSTAR UPS'),
    item('cat6_0m5', 'cable', 'Vention Cat6 0.5M'),
    item('cat6_1m', 'cable', 'Vention Cat6 1M'),
  ]

  const withCable: StoredLine[] = [
    line('ups', 1), line('cat6_0m5', 26), line('cat6_1m', 2),
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
    const suppressed = [line('ups', 1), line('cat6_0m5', 26, { suppressed: true })]
    render(
      <MaterialsTable lines={suppressed} catalog={sectioned} isAdmin={false}
        formulas={new Map()} onChange={vi.fn()} />,
    )
    expect(screen.queryByText(/Removed lines/i)).not.toBeInTheDocument()
  })

  // Otherwise a user can add a cable line that then vanishes with no feedback.
  it('keeps cable items out of the Add-line picker for a user', () => {
    render(
      <MaterialsTable lines={[line('ups', 1)]} catalog={sectioned} isAdmin={false}
        formulas={new Map()} onChange={vi.fn()} />,
    )
    const options = Array.from(
      (screen.getByLabelText('Add line') as HTMLSelectElement).options,
    ).map(o => o.value)
    expect(options).toContain('ups')
    expect(options).not.toContain('cat6_0m5')
  })

  // THE data-loss guard. saveLines deletes every row for the venue and
  // re-inserts only what it is given, so a filtered array reaching onChange
  // permanently deletes the hidden cable rows — silently, and only on venues
  // a non-admin happened to edit.
  it('returns hidden cable lines in onChange when a user edits another line', () => {
    const onChange = vi.fn()
    render(
      <MaterialsTable lines={withCable} catalog={sectioned} isAdmin={false}
        formulas={new Map()} onChange={onChange} />,
    )

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } })

    const payload = onChange.mock.calls[0][0] as StoredLine[]
    expect(payload).toHaveLength(3)
    expect(payload.map(l => l.roleKey).sort())
      .toEqual(['cat6_0m5', 'cat6_1m', 'ups'])
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

    const options = Array.from(
      (screen.getAllByRole('combobox')[0] as HTMLSelectElement).options,
    ).map(o => o.value)
    expect(options).not.toContain('cat6_0m5')
    expect(options).not.toContain('cat6_1m')
    expect(options).toContain('ups')
  })
})
