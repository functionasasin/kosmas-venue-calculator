import { supabase } from '@/lib/supabase'
import type { CalculatedLine, Item, Qty } from '@/calculator/types'
import type { RoleKey } from '@/calculator/roleKeys'

export interface StoredLine {
  id: string
  venueId: string
  /** The authoritative pointer to the catalog row. Survives deactivation. */
  itemId: string
  roleKey: RoleKey | null
  qty: Qty
  /** The role this line replaced, if the user swapped its SKU. */
  originRoleKey: RoleKey | null
  sortOrder: number
  source: 'formula' | 'manual'
  suppressed: boolean
  note: string | null
}

/**
 * Recalculation contract:
 *   formula line  -> quantity refreshed
 *   manual line   -> untouched (a deliberate correction must survive)
 *   suppressed    -> stays suppressed (a deleted line must not resurrect)
 *   formula line no longer produced -> dropped
 *   newly produced -> added as `formula`
 */
export function mergeRecalculation(
  stored: StoredLine[],
  calculated: CalculatedLine[],
): StoredLine[] {
  const byRole = new Map(calculated.map(c => [c.roleKey, c]))
  const kept: StoredLine[] = []

  for (const line of stored) {
    if (line.source === 'manual' || line.suppressed) {
      kept.push(line)
      continue
    }
    const fresh = line.roleKey ? byRole.get(line.roleKey) : undefined
    if (fresh) kept.push({ ...line, qty: fresh.qty })
    // A formula line with no fresh counterpart is dropped.
  }

  // A swapped line occupies the role it replaced as well as its own, so the
  // vacated role is not re-added underneath it.
  const present = new Set<RoleKey | null>()
  for (const l of kept) {
    present.add(l.roleKey)
    if (l.originRoleKey) present.add(l.originRoleKey)
  }

  for (const c of calculated) {
    if (present.has(c.roleKey)) continue
    kept.push({
      id: `new:${c.roleKey}`,
      venueId: '',
      itemId: '',
      roleKey: c.roleKey,
      qty: c.qty,
      originRoleKey: null,
      sortOrder: 0,
      source: 'formula',
      suppressed: false,
      note: null,
    })
  }

  return kept
}

export async function listLines(venueId: string): Promise<StoredLine[]> {
  const { data, error } = await supabase
    .from('venue_lines')
    .select('*, items(role_key)')
    .eq('venue_id', venueId)
    .order('sort_order')
  if (error) throw error
  return (data ?? []).map(r => ({
    id: r.id,
    venueId: r.venue_id,
    itemId: r.item_id,
    roleKey: r.items?.role_key ?? null,
    // qty_tbd is the round-trip for the 'TBD' sentinel; without it a saved
    // TBD reloads as 0 and prints as 0 on the handed-out list.
    qty: r.qty_tbd ? ('TBD' as const) : r.qty,
    originRoleKey: r.origin_role_key ?? null,
    sortOrder: r.sort_order,
    source: r.source,
    suppressed: r.suppressed,
    note: r.note,
  }))
}

export async function saveLines(
  venueId: string, lines: StoredLine[], catalog: Item[],
): Promise<void> {
  const itemIdFor = new Map(
    catalog.filter(i => i.roleKey).map(i => [i.roleKey as RoleKey, i.id]),
  )

  // itemId is authoritative — it survives the item being deactivated or its
  // role key being reassigned. Only lines minted by mergeRecalculation have
  // an empty itemId, and those are resolved through the role map.
  const rows = lines
    .map((l, index) => {
      const itemId = l.itemId || (l.roleKey ? itemIdFor.get(l.roleKey) : undefined)
      if (!itemId) return null
      return {
        venue_id: venueId,
        item_id: itemId,
        qty: typeof l.qty === 'number' ? l.qty : 0,
        qty_tbd: l.qty === 'TBD',
        origin_role_key: l.originRoleKey,
        sort_order: index,
        source: l.source,
        suppressed: l.suppressed,
        note: l.note,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  const { error: delError } = await supabase
    .from('venue_lines').delete().eq('venue_id', venueId)
  if (delError) throw delError

  if (rows.length > 0) {
    const { error } = await supabase.from('venue_lines').insert(rows)
    if (error) throw error
  }
}
