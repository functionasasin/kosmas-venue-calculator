import { supabase } from '@/lib/supabase'
import type { Item } from '@/calculator/types'
import type { RoleKey } from '@/calculator/roleKeys'

const fromRow = (r: Record<string, unknown>): Item => ({
  id: r.id as string,
  name: r.name as string,
  category: r.category as string,
  roleKey: (r.role_key as RoleKey | null) ?? null,
  supplier: (r.supplier as string | null) ?? null,
  poeWatts: (r.poe_watts as number | null) ?? null,
  rackU: (r.rack_u as number | null) ?? null,
  unitPrice: (r.unit_price as number | null) ?? null,
  currency: (r.currency as string | null) ?? null,
  isActive: r.is_active as boolean,
  notes: (r.notes as string | null) ?? null,
  printNote: (r.print_note as string | null) ?? null,
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
    unit_price: item.unitPrice ?? null,
    currency: item.currency ?? null,
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
