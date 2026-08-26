import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = Record<string, unknown>

const upsert = vi.fn(async (_row: unknown) => ({ error: null }))
const rpc = vi.fn(async (_fn: string, _args: unknown) => ({ error: null }))

/** Every table name `listItems` has queried, in order. */
const tables: string[] = []
/** Every `.eq()` applied, so a dropped filter is visible. */
const filters: unknown[][] = []
/** What the next awaited query resolves with. */
let rows: Row[] = []

const builder = {
  select: () => builder,
  order: () => builder,
  eq: (...args: unknown[]) => { filters.push(args); return builder },
  update: () => builder,
  then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
    resolve({ data: rows, error: null }),
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      tables.push(table)
      return { ...builder, upsert }
    },
    rpc,
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  tables.length = 0
  filters.length = 0
  rows = []
})

const { listItems, upsertItem, setItemDefault } = await import('./items')

describe('upsertItem', () => {
  // is_default has to reach the row when it is supplied. Without it the flag
  // could not be set at all.
  it('sends is_default when the caller supplies it', async () => {
    await upsertItem({ name: 'Dahua', isDefault: true })
    expect(upsert.mock.calls[0][0]).toMatchObject({ is_default: true })
  })

  /**
   * OMITTED, not defaulted to false — and this is the important one.
   *
   * ItemForm builds its payload by hand and does not send isDefault, so
   * `is_default: item.isDefault ?? false` would mean that editing an item's
   * NOTES in the Catalog silently clears its role's default. The partial index
   * permits it (it constrains uniqueness, not existence) and the trigger does
   * not fire (it watches is_active), so the role would quietly become
   * ROLE_NO_DEFAULT and every unpinned venue would lose the item for that role.
   *
   * The upsert's ON CONFLICT DO UPDATE only touches the columns present in the
   * payload, so omitting the key leaves the stored value alone. On INSERT the
   * column default (false) applies, which is what a new item should get.
   */
  it('omits is_default entirely when the caller does not supply it', async () => {
    await upsertItem({ name: 'Dahua' })
    expect(upsert.mock.calls[0][0]).not.toHaveProperty('is_default')
  })


  /**
   * Same shape as is_default above, same reason, different blast radius.
   *
   * ItemForm sends no mainsWatts, so `mains_watts: item.mainsWatts ?? null`
   * meant that editing an item's NAME cleared its mains draw. Nothing showed
   * it: the Catalog had no column for it, the form had no field, and
   * calculateBOM reads a null as a legitimate 0 W. The UPS is sized on
   * (poeWatts + mainsWatts), so the venue quietly re-sizes down at ~2.4 VA per
   * lost watt, and the number cannot be recovered from the UI — it came off
   * the device's datasheet.
   */
  it('omits mains_watts entirely when the caller does not supply it', async () => {
    await upsertItem({ name: 'Mac mini (M4)' })
    expect(upsert.mock.calls[0][0]).not.toHaveProperty('mains_watts')
  })

  it('sends mains_watts when the caller supplies it', async () => {
    await upsertItem({ name: 'Mac mini (M4)', mainsWatts: 65 })
    expect(upsert.mock.calls[0][0]).toMatchObject({ mains_watts: 65 })
  })

  // Explicitly clearing it is a real edit — an item that turns out to draw
  // nothing from the wall — and must not be confused with not sending it.
  it('sends a null mains_watts when the caller clears it', async () => {
    await upsertItem({ name: 'Mac mini (M4)', mainsWatts: null })
    expect(upsert.mock.calls[0][0]).toMatchObject({ mains_watts: null })
  })
})

describe('setItemDefault', () => {
  // It must go through the RPC, not two PostgREST writes: clearing then
  // setting leaves a window with no default for the role, and the other order
  // is rejected by items_role_key_default, which is not deferrable.
  it('calls the set_item_default RPC rather than writing the column', async () => {
    await setItemDefault('item-1')
    expect(rpc).toHaveBeenCalledWith('set_item_default', { p_item_id: 'item-1' })
    expect(upsert).not.toHaveBeenCalled()
  })
})

describe('the anonymous catalog row mapper', () => {
  /**
   * supplier and notes are not columns of items_public, so an anonymous read
   * cannot produce them. Pinning them as null here is not a formality: Item
   * requires both fields, and the tempting shortcut — reusing fromRow and
   * letting the missing keys arrive as undefined — puts `undefined` where
   * `string | null` is declared, which type-checks in a test and reaches
   * ItemForm as a value it will happily write back through upsertItem.
   */
  it('maps supplier and notes to null on the anonymous path', async () => {
    rows = [{
      id: 'i1', name: 'Uniview IPC3624LE-ADF28K-WP (Owlview)',
      category: 'camera', role_key: 'replay_camera',
      poe_watts: 2.8, mains_watts: null, rack_u: 0,
      is_active: true, is_default: true, print_note: null,
    }]
    const items = await listItems(false)
    expect(items[0].supplier).toBeNull()
    expect(items[0].notes).toBeNull()
  })

  /**
   * The columns the sizing engine actually consumes must survive the view.
   * poeWatts and rackU feed checkPoeBudget and sumRackU directly, and roleKey
   * is what every formula targets — a mapper that dropped one of them would
   * size a venue wrong rather than fail.
   */
  it('carries the sizing columns through unchanged', async () => {
    rows = [{
      id: 'i1', name: 'Uniview IPC3624LE-ADF28K-WP (Owlview)',
      category: 'camera', role_key: 'replay_camera',
      poe_watts: 2.8, mains_watts: null, rack_u: 0,
      is_active: true, is_default: true, print_note: null,
    }]
    const items = await listItems(false)
    expect(items[0]).toMatchObject({
      id: 'i1', roleKey: 'replay_camera', poeWatts: 2.8, rackU: 0,
      isActive: true, isDefault: true,
    })
  })

  /**
   * The guard's real failure mode, and the reason its comparison is loose.
   *
   * Dropping a column from the view does not produce a null — PostgREST omits
   * the key, so it arrives as `undefined`. With `=== null` this test fails:
   * the guard waves the row through and `name: undefined` reaches
   * MaterialsSection and the printed BOM as a blank, with strictNullChecks off
   * and nothing raised anywhere.
   */
  it('throws rather than shipping an item with no name', async () => {
    rows = [{
      id: 'i1', category: 'camera', role_key: 'replay_camera',
      poe_watts: 2.8, mains_watts: null, rack_u: 0,
      is_active: true, is_default: true, print_note: null,
    }]  // no `name` key at all
    await expect(listItems(false)).rejects.toThrow(/view definition in 0017/)
  })
})

describe('listItems chooses its relation from the session', () => {
  /**
   * The admin path must keep reading the base table. This is not a
   * preference — upsertItem writes `supplier: item.supplier ?? null` and
   * `notes: item.notes ?? null` unguarded (items.ts:41,74), so if the Catalog
   * ever read the narrowed view, every item edit would blank both columns
   * silently. That is character-for-character the mains_watts bug of
   * 2026-08-24. The rule it establishes: a narrowed read never feeds a write.
   */
  it('reads the items table when signed in', async () => {
    await listItems(true, true)
    expect(tables).toEqual(['items'])
  })

  /**
   * Requirement 9. items_public is the only relation an anonymous browser may
   * read, because it is the only one that cannot return supplier or notes.
   * Asserting the RELATION rather than the returned columns is what makes this
   * test meaningful: a select list can be widened by anyone editing this file,
   * where the view's shape is enforced by Postgres.
   */
  it('reads items_public when anonymous', async () => {
    await listItems(false, true)
    expect(tables).toEqual(['items_public'])
  })

  /**
   * includeInactive has to work identically on both, or a saved line whose SKU
   * was retired renders unnamed for anon and named for admin.
   *
   * Asserts the FILTER, not the table name. Asserting the table here would pass
   * with the `.eq()` deleted from both branches — it would restate the two
   * tests above and prove nothing about includeInactive at all.
   */
  it('applies the is_active filter only when includeInactive is false', async () => {
    await listItems(false, true)
    expect(filters).toEqual([])

    filters.length = 0
    await listItems(false, false)
    expect(filters).toEqual([['is_active', true]])

    filters.length = 0
    await listItems(true, false)
    expect(filters).toEqual([['is_active', true]])
  })
})
