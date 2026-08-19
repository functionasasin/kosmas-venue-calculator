import { supabase } from '@/lib/supabase'
import type { CalculatedLine, Item, Qty } from '@/calculator/types'
import { readRoleKey, type RoleKey } from '@/calculator/roleKeys'
import { getVenue, venueFromRow, type Venue } from './venues'

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
    roleKey: readRoleKey(r.items?.role_key),
    // qty_tbd is the round-trip for the 'TBD' sentinel; without it a saved
    // TBD reloads as 0 and prints as 0 on the handed-out list.
    qty: r.qty_tbd ? ('TBD' as const) : r.qty,
    originRoleKey: readRoleKey(r.origin_role_key),
    sortOrder: r.sort_order,
    // Unlike the role keys, `source` IS constrained in the schema —
    // check (source in ('formula','manual')) — so the database cannot return
    // anything else. PostgREST reports it as plain text because it does not
    // introspect check constraints, hence the assertion rather than a guard.
    source: r.source as StoredLine['source'],
    suppressed: r.suppressed,
    note: r.note,
  }))
}

/**
 * The venue was saved by someone else since this one was loaded. Carries who
 * and when so the dialog can say whose work the two exits would destroy.
 */
export class VenueConflictError extends Error {
  savedByEmail: string | null
  savedAt: string

  constructor(savedByEmail: string | null, savedAt: string) {
    super('venue_conflict')
    this.name = 'VenueConflictError'
    this.savedByEmail = savedByEmail
    this.savedAt = savedAt
  }
}

/**
 * One or more lines point at no catalog item. The old saveLines filtered these
 * away silently and reported success; raising is the fix, and `lines` is what
 * lets the screen name them rather than showing a dead end.
 */
export class UnresolvedLinesError extends Error {
  lines: StoredLine[]

  constructor(lines: StoredLine[]) {
    super('unresolved_lines')
    this.name = 'UnresolvedLinesError'
    this.lines = lines
  }
}

const lineFromRpc = (r: Record<string, unknown>): StoredLine => ({
  id: r.id as string,
  venueId: r.venue_id as string,
  itemId: r.item_id as string,
  // Supplied by the RPC's join against items — venue_lines has no role_key
  // column. See 0007_save_venue_rpc.sql.
  roleKey: readRoleKey(r.role_key as string | null),
  qty: r.qty_tbd ? ('TBD' as const) : (r.qty as number),
  originRoleKey: readRoleKey(r.origin_role_key as string | null),
  sortOrder: r.sort_order as number,
  source: r.source as StoredLine['source'],
  suppressed: r.suppressed as boolean,
  note: (r.note as string | null) ?? null,
})

/**
 * Saves the venue and its whole materials list in ONE transaction, with an
 * optimistic-lock check against the `updatedAt` this venue was loaded with.
 *
 * Replaces saveVenue + saveLines, which were two independent writes, the second
 * of which was itself a DELETE followed by a separate INSERT. A failure between
 * them left a venue whose inputs and materials list disagreed — exactly the
 * divergence the stale/staleExport machinery exists to catch, reached through
 * the save path instead of through editing.
 */
export async function saveVenueAndLines(
  venue: Venue, lines: StoredLine[], catalog: Item[],
): Promise<{ venue: Venue; lines: StoredLine[] }> {
  const itemIdFor = new Map(
    catalog.filter(i => i.roleKey).map(i => [i.roleKey as RoleKey, i.id]),
  )

  // itemId is authoritative — it survives the item being deactivated or its
  // role key being reassigned. Only lines minted by mergeRecalculation have an
  // empty itemId, and those resolve through the role map.
  const unresolved: StoredLine[] = []
  const payload = lines.flatMap(l => {
    const itemId = l.itemId || (l.roleKey ? itemIdFor.get(l.roleKey) : undefined)
    if (!itemId) { unresolved.push(l); return [] }
    return [{
      item_id: itemId,
      // The RPC casts with ::int, so the TBD sentinel must not reach it.
      qty: typeof l.qty === 'number' ? l.qty : 0,
      qty_tbd: l.qty === 'TBD',
      origin_role_key: l.originRoleKey,
      source: l.source,
      suppressed: l.suppressed,
      note: l.note,
    }]
  }).map((row, index) => ({
    ...row,
    // Print order is the on-screen order, so this is the array index and not
    // the stored sortOrder.
    sort_order: index,
  }))

  // Raised BEFORE the RPC: nothing is written, so the failure is total rather
  // than partial.
  if (unresolved.length > 0) throw new UnresolvedLinesError(unresolved)

  const { data, error } = await supabase.rpc('save_venue', {
    p_venue: {
      id: venue.id,
      name: venue.name,
      courts: venue.courts,
      tier: venue.tier,
      security_cameras: venue.securityCameras,
      kisi_doors: venue.kisiDoors,
      extended_retention: venue.extendedRetention,
      backup_internet: venue.backupInternet,
    },
    p_lines: payload,
    // Verbatim. Never through a Date — see Venue.updatedAt.
    p_expected_updated_at: venue.updatedAt,
  })

  if (error) {
    if (error.code === 'PT409') {
      // The RPC rolled back before returning anything, so who-and-when comes
      // from a fresh read. Only on the conflict path.
      const current = await getVenue(venue.id)
      throw new VenueConflictError(current.updatedByEmail, current.updatedAt)
    }
    throw error
  }

  // `returns jsonb` types data as Json, a union including string | number |
  // boolean | null, so this narrows explicitly rather than destructuring.
  const payloadOut = data as unknown as {
    venue: Record<string, unknown>
    lines: Record<string, unknown>[]
  }
  return {
    venue: venueFromRow(payloadOut.venue),
    lines: payloadOut.lines.map(lineFromRpc),
  }
}
