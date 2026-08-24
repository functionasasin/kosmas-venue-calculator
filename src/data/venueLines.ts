import { supabase } from '@/lib/supabase'
import type { CalculatedLine, Item, Qty } from '@/calculator/types'
import { readRoleKey, type RoleKey } from '@/calculator/roleKeys'
import { getVenue, venueFromRow, type Venue } from './venues'
import { choiceFromRow, type VenueItemChoice } from './venueItemChoices'

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
 * role -> the id of the ACTIVE item holding it, for a catalog that has already
 * been through resolveCatalog — so exactly one item holds each role and this
 * Map cannot be last-wins over two candidates.
 *
 * NOT itemsByRole from src/lib/sections: that one deliberately does not filter
 * on isActive, because it feeds the screen, where a saved line whose item was
 * deactivated must still render its name. Here a deactivated item must never
 * be minted onto a fresh line, so the filter is the point.
 *
 * One helper because mergeRecalculation and saveVenueAndLines both need it and
 * both used to build it inline — the isActive term was added to one of the two
 * long after the other, which is exactly the drift this prevents.
 */
const itemIdByRole = (catalog: Item[]): Map<RoleKey, string> =>
  new Map(
    catalog
      .filter(i => i.isActive && i.roleKey)
      .map(i => [i.roleKey as RoleKey, i.id]),
  )

/**
 * Recalculation contract:
 *   formula line  -> quantity refreshed, item re-pointed at the resolved one
 *   manual line   -> untouched (a deliberate correction must survive)
 *   suppressed    -> stays suppressed (a deleted line must not resurrect)
 *   formula line no longer produced -> dropped
 *   newly produced -> added as `formula`, already carrying its item
 *
 * `resolved` is a catalog that has been through resolveCatalog, so exactly one
 * ACTIVE item holds each role key. The item resolution lives here beside
 * itemIdFor rather than on CalculatedLine, which is the sizing output and is
 * constructed directly by several engine tests.
 *
 * Re-pointing itemId is not cosmetic. exportMaterials resolves the printed
 * name by itemId first and saveVenueAndLines prefers a line's stored itemId
 * over the role map, so without this a venue's hardware choice would move the
 * UPS rung and leave the old item on the saved list and on the PDF.
 */
export function mergeRecalculation(
  stored: StoredLine[],
  calculated: CalculatedLine[],
  resolved: Item[],
): StoredLine[] {
  const byRole = new Map(calculated.map(c => [c.roleKey, c]))
  const itemIdFor = itemIdByRole(resolved)
  const kept: StoredLine[] = []

  for (const line of stored) {
    if (line.source === 'manual' || line.suppressed) {
      kept.push(line)
      continue
    }
    const fresh = line.roleKey ? byRole.get(line.roleKey) : undefined
    if (fresh) {
      // `?? line.itemId`, not `?? ''`: a role that currently resolves to
      // nothing must not blank an itemId the line already had, or a transient
      // catalog state would turn a saveable venue into an unresolved-lines
      // error.
      const itemId =
        (line.roleKey ? itemIdFor.get(line.roleKey) : undefined) ?? line.itemId
      kept.push({ ...line, qty: fresh.qty, itemId })
    }
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
      // Empty when the role resolves to nothing — the line still renders, as
      // "No active item mapped for …", and saveVenueAndLines raises
      // UnresolvedLinesError rather than writing a dangling row.
      itemId: itemIdFor.get(c.roleKey) ?? '',
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
 * Saves the venue, its whole materials list AND its hardware choices in ONE
 * transaction, with an optimistic-lock check against the `updatedAt` this
 * venue was loaded with.
 *
 * `choices` is the venue's FULL set, not a delta — the RPC deletes and
 * re-inserts, so an omitted role is a removal. VenueDetail derives it from the
 * resolved catalog, which is what makes a venue that has never chosen still
 * pin its defaults the first time it is saved.
 *
 * `catalog` must already be resolved (src/lib/resolveCatalog.ts): itemIdByRole
 * is a plain role -> id Map, so an unresolved catalog with two active cameras
 * would mint the LAST one into every freshly calculated line.
 */
export async function saveVenueAndLines(
  venue: Venue,
  lines: StoredLine[],
  catalog: Item[],
  choices: VenueItemChoice[],
): Promise<{ venue: Venue; lines: StoredLine[]; choices: VenueItemChoice[] }> {
  const itemIdFor = itemIdByRole(catalog)

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
    p_choices: choices.map(c => ({ role_key: c.roleKey, item_id: c.itemId })),
    // Verbatim. Never through a Date — see Venue.updatedAt.
    p_expected_updated_at: venue.updatedAt,
  })

  if (error) {
    if (error.code === 'PT409') {
      // The RPC rolled back before returning anything, so who-and-when comes
      // from a fresh read. Only on the conflict path.
      //
      // That read can itself fail — the other account may have DELETED the
      // venue, which is a conflict too. Letting its error propagate would
      // replace the typed conflict with a raw PostgREST string, so the screen
      // would show a toast instead of the dialog and offer no way forward.
      // Losing the attribution is acceptable; losing the dialog is not.
      let savedByEmail: string | null = null
      let savedAt = ''
      try {
        const current = await getVenue(venue.id)
        savedByEmail = current.updatedByEmail
        savedAt = current.updatedAt
      } catch { /* attribution unavailable — the conflict still stands */ }
      throw new VenueConflictError(savedByEmail, savedAt)
    }
    throw error
  }

  // `returns jsonb` types data as Json, a union including string | number |
  // boolean | null, so this narrows explicitly rather than destructuring.
  const payloadOut = data as unknown as {
    venue: Record<string, unknown>
    lines: Record<string, unknown>[]
    choices: { role_key: string | null; item_id: string }[]
  }
  return {
    venue: venueFromRow(payloadOut.venue),
    lines: payloadOut.lines.map(lineFromRpc),
    // Same narrowing as listChoices: role_key is unconstrained text, so a
    // choice for a role the app has retired is dropped rather than typed as a
    // RoleKey.
    choices: (payloadOut.choices ?? [])
      .map(choiceFromRow)
      .filter((c): c is VenueItemChoice => c !== null),
  }
}
