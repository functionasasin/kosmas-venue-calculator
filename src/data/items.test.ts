import { describe, it, expect, vi, beforeEach } from 'vitest'

const upsert = vi.fn(async (_row: unknown) => ({ error: null }))
const rpc = vi.fn(async (_fn: string, _args: unknown) => ({ error: null }))
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ upsert }), rpc },
}))

beforeEach(() => vi.clearAllMocks())

const { upsertItem, setItemDefault } = await import('./items')

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
