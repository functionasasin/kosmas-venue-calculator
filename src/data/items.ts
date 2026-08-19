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
  rackU: r.rack_u,
  isActive: r.is_active,
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
    rack_u: item.rackU ?? null,
    is_active: item.isActive ?? true,
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
