import type { Item, Qty } from '@/calculator/types'
import { readRoleKey, type RoleKey } from '@/calculator/roleKeys'

/**
 * Everything both storage backends share, and nothing that talks to either.
 *
 * This file imports no Supabase client and no localStorage, which is the
 * property that matters: venueLines.ts (Postgres) and localVenues.ts
 * (localStorage) both import from here, so a line, an error or a role lookup
 * means exactly one thing regardless of where a venue is stored.
 *
 * The two error classes are the load-bearing half. `instanceof` is identity on
 * the class object and VenueDetail gates both of its recovery dialogs on it, so
 * a second declaration anywhere would not fail loudly — it would silently
 * replace the conflict dialog and the unresolved-lines dialog with an
 * auto-dismissing toast, leaving the user's edits on screen with no way to save
 * them. venueLines.ts re-exports all three public declarations so that every
 * existing import site — VenueDetail.tsx, venueLines.test.ts, merge.test.ts —
 * keeps working untouched.
 */

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
 * The venue was saved by someone else since this one was loaded. Carries who
 * and when so the dialog can say whose work the two exits would destroy.
 *
 * `savedByEmail` is null for a local venue: there are no accounts in
 * localStorage and the other writer is another tab. `savedAt` must NEVER be
 * empty on either backend — "Overwrite theirs" rebases on it, and thrown with
 * an empty one that button conflicts forever.
 *
 * It carries NO local/remote flag, deliberately. One was added and removed
 * again: the dialog does need to know, but VenueDetail already asks
 * isLocalVenueId(venue.id) for the session-loss watch and for SaveStatus, so a
 * flag here is a second way to answer a question the screen answers anyway —
 * and dispatch is on the venue's id, so the two could never even disagree.
 * (Do not infer it from `savedByEmail === null` either: 0006 stamps every
 * UPDATE with `coalesce(auth.jwt() ->> 'email', 'unknown')`, but the database
 * path also yields null when the post-conflict re-read itself fails, and that
 * conflict is not local.)
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
 * One helper because mergeRecalculation, saveVenueAndLines AND the local save
 * all need it, and the first two used to build it inline — the isActive term
 * was added to one of the two long after the other, which is exactly the drift
 * this prevents. A third caller in a second backend makes that worse, not
 * better, which is why it lives here rather than beside either one.
 *
 * (This file importing no client is a property worth keeping, but it is not
 * what justifies the move: localVenues.ts imports ./venues and
 * ./venueItemChoices for their mappers, and both reach the client anyway.)
 */
export const itemIdByRole = (catalog: Item[]): Map<RoleKey, string> =>
  new Map(
    catalog
      .filter(i => i.isActive && i.roleKey)
      .map(i => [i.roleKey as RoleKey, i.id]),
  )

/**
 * Every line paired with the item id it will be SAVED against, or
 * UnresolvedLinesError if any line resolves to nothing.
 *
 * itemId is authoritative — it survives the item being deactivated or its role
 * key being reassigned. Only lines minted by mergeRecalculation have an empty
 * itemId, and those resolve through the role map.
 *
 * Raised BEFORE either backend reads or writes anything, so a failure is total
 * rather than partial.
 *
 * One helper for the same reason itemIdByRole is one: both saveVenueAndLines
 * and localSaveVenueAndLines need this exact rule, and a second hand-written
 * copy is how the isActive term came to be in one of itemIdByRole's two inline
 * ancestors and not the other. The rule is the fallback ORDER — stored itemId
 * first, role map second, unresolved last — and a backend that got that order
 * wrong would silently re-point a line at the role's default instead of the SKU
 * the venue actually chose.
 */
export const resolveLineItems = (
  lines: StoredLine[],
  catalog: Item[],
): { line: StoredLine; itemId: string }[] => {
  const itemIdFor = itemIdByRole(catalog)
  const unresolved: StoredLine[] = []
  const resolved = lines.flatMap(line => {
    const itemId =
      line.itemId || (line.roleKey ? itemIdFor.get(line.roleKey) : undefined)
    if (!itemId) { unresolved.push(line); return [] }
    return [{ line, itemId }]
  })
  if (unresolved.length > 0) throw new UnresolvedLinesError(unresolved)
  return resolved
}

/**
 * One stored row -> one StoredLine.
 *
 * Named `lineFromRow`, not `lineFromRpc`: the local backend stores its lines in
 * the RPC's own snake_case row shape precisely so that it can run this mapper
 * rather than a parallel one, and a name claiming a single origin would be a
 * lie the next reader has to discover.
 *
 * `role_key` is supplied by the writer, not read off a column — venue_lines has
 * no role_key column. 0013 joins items for it; localVenues derives it from the
 * catalog. See 0007_save_venue_rpc.sql.
 */
export const lineFromRow = (r: Record<string, unknown>): StoredLine => ({
  id: r.id as string,
  venueId: r.venue_id as string,
  itemId: r.item_id as string,
  roleKey: readRoleKey(r.role_key as string | null),
  qty: r.qty_tbd ? ('TBD' as const) : (r.qty as number),
  originRoleKey: readRoleKey(r.origin_role_key as string | null),
  sortOrder: r.sort_order as number,
  source: r.source as StoredLine['source'],
  suppressed: r.suppressed as boolean,
  note: (r.note as string | null) ?? null,
})

/**
 * The venue is not in the store this id points at.
 *
 * Three shapes mean this and arrive differently: a localStorage key that is not
 * there, a PostgREST `.single()` that matched no row (PGRST116 — which is what
 * an anonymous read of a database venue returns, because the RLS policies are
 * scoped `to authenticated` and match nothing rather than erroring), and the
 * RPC's `raise exception 'venue_not_found' using errcode = 'PT404'` (0013:50).
 *
 * The message is the wire-level string all three already use, so a caller that
 * falls back to `e.message` reads the same thing it always did.
 *
 * Deliberately NOT raised for anything else. Matching more broadly would tell a
 * user their venue is missing when the real fault was a constraint violation or
 * a dropped connection, and the retry they would then not attempt is the one
 * that would have worked.
 */
export class VenueMissingError extends Error {
  constructor() {
    super('venue_not_found')
    this.name = 'VenueMissingError'
  }
}
