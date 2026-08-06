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
      />,
    )

    fireEvent.change(screen.getAllByRole('combobox')[0], {
      target: { value: 'display' },
    })

    const [updated] = onChange.mock.calls[0][0] as StoredLine[]
    expect(updated.originRoleKey).toBe('display')
  })
})
