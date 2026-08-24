import { supabase } from '@/lib/supabase'
import type { Item } from '@/calculator/types'
import { readRoleKey } from '@/calculator/roleKeys'
import type { Tables } from '@/lib/database.types'

/**
 * The row shape comes from the generated schema types, so a renamed or retyped
 * column fails the build here rather than surfacing as `undefined` on a printed
 * BOM. `role_key` still needs narrowing: it is unconstrained `text`, so only
 * the compiler's word that it is a string comes for free.
 */
const fromRow = (r: Tables<'items'>): Item => ({
  id: r.id,
  name: r.name,
  category: r.category,
  roleKey: readRoleKey(r.role_key),
  supplier: r.supplier,
  poeWatts: r.poe_watts,
  mainsWatts: r.mains_watts,
  rackU: r.rack_u,
  isActive: r.is_active,
  isDefault: r.is_default,
  notes: r.notes,
  printNote: r.print_note,
})

export async function listItems(includeInactive = false): Promise<Item[]> {
  let q = supabase.from('items').select('*').order('category').order('name')
  if (!includeInactive) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export async function upsertItem(item: Partial<Item> & { name: string }) {
  const row = {
    ...(item.id ? { id: item.id } : {}),
    name: item.name,
    category: item.category ?? 'uncategorised',
    role_key: item.roleKey ?? null,
    supplier: item.supplier ?? null,
    poe_watts: item.poeWatts ?? null,
    /**
     * Present only when the caller supplied it, exactly like is_default below
     * and for the same reason — with a worse failure.
     *
     * `item.mainsWatts ?? null` wrote a null on every edit from ItemForm,
     * which sent no mainsWatts at all until 2026-08-24, so renaming an item
     * destroyed its mains draw. Nothing surfaced it: the value is a direct UPS
     * input (calculateBOM sums poeWatts + mainsWatts) and a null reads there
     * as a legitimate 0 W, so the venue simply re-sized ~2.4 VA smaller per
     * lost watt. Unlike is_default it cannot be restored from the app — the
     * number comes off the device's datasheet.
     *
     * `undefined` is "not supplied"; an explicit `null` still writes, because
     * an item that genuinely draws nothing from the wall is a real edit.
     */
    ...(item.mainsWatts !== undefined ? { mains_watts: item.mainsWatts } : {}),
    rack_u: item.rackU ?? null,
    is_active: item.isActive ?? true,
    /**
     * Present only when the caller supplied it. `item.isDefault ?? false`
     * would look equivalent and would silently clear the flag on every edit
     * from ItemForm, which builds its payload by hand and does not send it —
     * so editing an item's notes would take its role's default away.
     *
     * The upsert's ON CONFLICT DO UPDATE only writes the columns present in
     * the payload, so an absent key leaves the stored value untouched, and a
     * fresh INSERT falls to the column default (false). "Make default" in the
     * Catalog is the only thing that moves the flag, and it goes through the
     * RPC.
     */
    ...(item.isDefault !== undefined ? { is_default: item.isDefault } : {}),
    notes: item.notes ?? null,
    print_note: item.printNote ?? null,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('items').upsert(row)
  if (error) throw error
}

export async function setItemActive(id: string, isActive: boolean) {
  const { error } = await supabase
    .from('items').update({ is_active: isActive }).eq('id', id)
  if (error) throw error
}

/**
 * Moves a role's default onto this item. One RPC, not two writes: clearing the
 * incumbent and setting the new one in separate statements leaves the role with
 * no default in between, and doing it the other way round is rejected by
 * items_role_key_default, which is not deferrable. See 0011.
 */
export async function setItemDefault(id: string) {
  const { error } = await supabase.rpc('set_item_default', { p_item_id: id })
  if (error) throw error
}
