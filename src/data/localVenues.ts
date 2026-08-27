import { venueFromRow, type Venue } from './venues'
import { choiceFromRow, type VenueItemChoice } from './venueItemChoices'
import {
  lineFromRow, resolveLineItems, VenueConflictError, type StoredLine,
} from './venueTypes'
import type { Item, VenueInputs } from '@/calculator/types'

/**
 * The localStorage venue backend.
 *
 * ONE KEY PER VENUE, holding one JSON blob: { schema, venue, lines, choices }.
 * One setItem is the transaction. Three keys would re-create exactly the split
 * write that 0007 and 0013 were written to eliminate — a partial write leaving
 * a venue's pinned camera disagreeing with its line's item_id — and one blob
 * also gives the delete cascade that `on delete cascade` gives free in Postgres
 * (0001_schema.sql:38, 0012:10).
 *
 * Stored in the database's own SNAKE_CASE ROW SHAPE, deliberately. That is what
 * lets the read path run venueFromRow, lineFromRow and choiceFromRow — the same
 * mappers the Supabase path runs — so the tier fallback, the retired-role-key
 * drop and the qty_tbd sentinel behave identically without a second
 * implementation of any of them. The alternative, faking a supabase.from()
 * client, means faking PostgREST's chaining, error codes and RPC semantics:
 * far more surface than seven functions.
 *
 * localStorage is a flat shared namespace and theme-init.ts already occupies
 * 'theme' in it, hence the prefix.
 */

const SCHEMA = 1
const KEY_PREFIX = 'pvc:v1:venue:'

/**
 * The id keeps the prefix; the key does not. A venue with id `local_a1b2…`
 * lives at `pvc:v1:venue:a1b2…`.
 *
 * Both halves matter. Storing the full id inside the key, or dropping the
 * prefix from Venue.id, each produce a store the other cannot read — and the
 * prefix on the ID is what venueStore's resolver dispatches on, so a venue
 * whose id lost it would route its next save to Supabase.
 */
export const LOCAL_ID_PREFIX = 'local_'

export const isLocalVenueId = (id: string): boolean =>
  id.startsWith(LOCAL_ID_PREFIX)

const keyFor = (id: string): string =>
  KEY_PREFIX + id.slice(LOCAL_ID_PREFIX.length)

const idFromKey = (key: string): string =>
  LOCAL_ID_PREFIX + key.slice(KEY_PREFIX.length)

interface VenueBlob {
  schema: number
  venue: Record<string, unknown>
  lines: Record<string, unknown>[]
  choices: { role_key: string | null; item_id: string }[]
}

class BlobUnreadableError extends Error {
  reason: 'unreadable' | 'newer_schema'

  constructor(reason: 'unreadable' | 'newer_schema', message: string) {
    super(message)
    this.name = 'BlobUnreadableError'
    this.reason = reason
  }
}

/**
 * VALIDATION AT THE BOUNDARY, then the mappers.
 *
 * venueFromRow is a cast, not a parse — `r.courts as number` — and tsconfig
 * sets no `strict`, so nothing in the type system objects. A truncated or
 * hand-edited blob (trivially available to anyone with devtools, which is now
 * every user) would reach calculateBOM with `courts: undefined` and size the
 * whole venue on NaN: no error, no warning, a printed BOM of NaNs.
 *
 * `tier` is deliberately NOT checked here. readTier cannot fail — it falls back
 * to 'pro' for anything it does not recognise — and venueFromRow runs it, so
 * the database path's narrowing applies unchanged.
 */
const parseBlob = (raw: string): VenueBlob => {
  const bad = (why: string) => new BlobUnreadableError('unreadable', why)

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw bad('venue_blob_not_json')
  }
  if (typeof parsed !== 'object' || parsed === null) throw bad('venue_blob_not_object')

  const b = parsed as Record<string, unknown>
  if (typeof b.schema !== 'number') throw bad('venue_blob_no_schema')
  // Surfaced, never auto-deleted, and never "upgraded" by guessing: it is the
  // user's only copy, and an older build cannot know what a newer one wrote.
  if (b.schema > SCHEMA) {
    throw new BlobUnreadableError('newer_schema', 'venue_blob_newer_schema')
  }

  const venue = b.venue
  if (typeof venue !== 'object' || venue === null) throw bad('venue_blob_no_venue')
  const v = venue as Record<string, unknown>
  if (typeof v.name !== 'string') throw bad('venue_blob_bad_name')
  // Number.isFinite cannot fire on a value that came through JSON.parse — JSON
  // has no NaN or Infinity literal, so those arrive as null and the typeof arm
  // catches them. It is kept because this predicate states what `courts` must
  // BE, and the day something hands this validator a value from anywhere other
  // than JSON.parse is not the day to discover it was only ever a typeof check.
  if (typeof v.courts !== 'number' || !Number.isFinite(v.courts) || v.courts < 1) {
    throw bad('venue_blob_bad_courts')
  }
  if (!Array.isArray(b.lines)) throw bad('venue_blob_bad_lines')
  if (!Array.isArray(b.choices)) throw bad('venue_blob_bad_choices')

  return {
    schema: b.schema,
    venue: v,
    lines: b.lines as Record<string, unknown>[],
    choices: b.choices as VenueBlob['choices'],
  }
}

/**
 * Loads one venue's blob by id.
 *
 * A missing key throws `venue_not_found` — the same message 0013:50 raises with
 * errcode PT404 — so Plan 3's not-found state can give one typed error one
 * sentence, whichever backend the URL addressed.
 */
const load = (id: string): VenueBlob => {
  let raw: string | null
  try {
    raw = localStorage.getItem(keyFor(id))
  } catch {
    // Safari in private mode throws on ACCESS, not just on write —
    // theme-init.ts:18-23 already knows this.
    throw new Error('local_storage_unavailable')
  }
  if (raw === null) throw new Error('venue_not_found')
  return parseBlob(raw)
}

export async function localGetVenue(id: string): Promise<Venue> {
  // The blob carries its own venue.id, but the KEY is the address: every other
  // function resolves through it, so if the two ever disagree the key wins.
  return venueFromRow({ ...load(id).venue, id })
}

export async function localListLines(id: string): Promise<StoredLine[]> {
  return load(id).lines.map(r => lineFromRow({ ...r, venue_id: id }))
}

export async function localListChoices(id: string): Promise<VenueItemChoice[]> {
  return load(id).choices
    .map(choiceFromRow)
    .filter((c): c is VenueItemChoice => c !== null)
}

export interface UnreadableVenue {
  id: string
  reason: 'unreadable' | 'newer_schema'
}

/**
 * PARSES EVERY BLOB, DELIBERATELY — do not optimise this into an index.
 *
 * Listing venues enumerates keys by prefix, getItems each blob, parses it, and
 * throws away `lines` and `choices` to render three columns. That is a real
 * cost paid synchronously on the landing screen: a Pro 8-court venue is ~25
 * lines.
 *
 * It is still correct. A separate `pvc:v1:index` key holding summaries is the
 * same split write the one-blob-per-venue layout exists to reject: the index
 * and the blobs drift, and the list then names venues that do not open, or
 * hides ones that exist. If this ever becomes slow enough to matter, the answer
 * is fewer venues in one browser profile, not a second source of truth.
 *
 * Synchronous, unlike its Supabase counterpart: localStorage is. venueStore is
 * where the two are given one async signature.
 */
export function localListVenues(): { venues: Venue[]; unreadable: UnreadableVenue[] } {
  let keys: string[]
  try {
    // localStorage.key(i) rather than Object.keys(localStorage): the indexed
    // form is the specified enumeration, where own-key enumeration depends on
    // the Storage object's proxy traps. Snapshotted before reading, so nothing
    // here iterates a collection it is also touching.
    keys = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k !== null && k.startsWith(KEY_PREFIX)) keys.push(k)
    }
  } catch {
    // Storage unavailable is not "no venues" and not an error here — the
    // Venues list still has to render. Plan 3's startup banner is what tells
    // the user, and it detects the same condition on its own.
    return { venues: [], unreadable: [] }
  }

  const rows: { venue: Venue; createdAt: string }[] = []
  const unreadable: UnreadableVenue[] = []

  for (const key of keys) {
    const id = idFromKey(key)
    try {
      const blob = parseBlob(localStorage.getItem(key) ?? '')
      rows.push({
        venue: venueFromRow({ ...blob.venue, id }),
        createdAt: String(blob.venue.created_at ?? ''),
      })
    } catch (e) {
      // One bad blob costs one row. A JSON.parse throw inside a map over
      // enumerated keys would take down the entire Venues list.
      unreadable.push({
        id,
        reason: e instanceof BlobUnreadableError ? e.reason : 'unreadable',
      })
    }
  }

  // Newest first, matching venues.ts:54's `order('created_at', desc)`. Venue
  // carries no createdAt field, so this comparator reads the row shape directly
  // and is the only place created_at is used for anything.
  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))

  return { venues: rows.map(r => r.venue), unreadable }
}

/**
 * The one write primitive. Every mutation in this file goes through it, so
 * every mutation is a single setItem and the failure message is written once.
 *
 * Detecting unavailable storage at startup (Plan 3) does not remove the need
 * for this: QuotaExceededError and a mid-session permissions change both throw
 * HERE, not at startup, and by then the user has a screen full of work.
 */
const write = (id: string, blob: VenueBlob): void => {
  try {
    localStorage.setItem(keyFor(id), JSON.stringify(blob))
  } catch {
    throw new Error(
      'This browser would not store the venue — its storage is full or ' +
      'blocked. Nothing was saved.',
    )
  }
}

/**
 * CREATE only, mirroring venues.ts's saveVenue, which is insert-only for the
 * same reason: updates go through localSaveVenueAndLines, which carries the
 * optimistic-lock baseline.
 *
 * Writes the whole blob synchronously before returning. Venues.create navigates
 * to /venues/<id> the moment this resolves, and VenueDetail's loader calls
 * getVenue, listLines and listChoices immediately — all three of which throw
 * venue_not_found against a key that is not there yet.
 */
export async function localSaveVenue(
  v: Partial<VenueInputs> & { name: string },
): Promise<Venue> {
  const id = LOCAL_ID_PREFIX + crypto.randomUUID()
  const now = new Date().toISOString()
  const row: Record<string, unknown> = {
    id,
    name: v.name,
    // The same defaults 0001's column definitions give the INSERT path, spelled
    // out because localStorage has none.
    courts: v.courts ?? 1,
    tier: v.tier ?? 'pro',
    security_cameras: v.securityCameras ?? 0,
    kisi_doors: v.kisiDoors ?? 0,
    extended_retention: v.extendedRetention ?? false,
    backup_internet: v.backupInternet ?? false,
    created_at: now,
    updated_at: now,
    // No invented authorship. 0006's coalesce to 'unknown' solves a different
    // problem — a signed-in account whose JWT carries no email claim — and
    // there is no account here at all.
    created_by_email: null,
    updated_by_email: null,
  }
  write(id, { schema: SCHEMA, venue: row, lines: [], choices: [] })
  return venueFromRow(row)
}

/**
 * Hard delete, and the whole cascade: one key holds the venue, its lines and
 * its choices, so there is nothing left over and nothing to recover. Callers
 * confirm first — Venues already does.
 */
export async function localDeleteVenue(id: string): Promise<void> {
  try {
    localStorage.removeItem(keyFor(id))
  } catch {
    throw new Error('This browser would not delete the venue — its storage is blocked.')
  }
}

/**
 * The local `updated_at`, which is the whole optimistic lock.
 *
 * `updatedAt` is OPAQUE everywhere else in this codebase: minted, stored,
 * compared verbatim, never re-derived from a Date. This is the one place a
 * value is produced, and `previous` is used only as something to be UNEQUAL to
 * — it is never parsed, reformatted or returned.
 *
 * The collision branch is not theoretical. toISOString is millisecond-precision
 * and localStorage is synchronous, so a Save immediately followed by "Save and
 * leave" can land inside one millisecond; two identical strings would then pass
 * a lock that should conflict. `Date.now() + 1` is a fresh clock reading one
 * millisecond on, not an arithmetic edit of `previous`. The database sidesteps
 * all of this with microseconds.
 */
const mintUpdatedAt = (previous: string): string => {
  const now = new Date().toISOString()
  return now === previous ? new Date(Date.now() + 1).toISOString() : now
}

/**
 * The local mirror of saveVenueAndLines. Same four arguments, same return
 * shape, same failure ordering.
 *
 * `catalog` is ALREADY RESOLVED and already filtered to active items —
 * VenueDetail does both before it gets here. This function must never resolve
 * one itself: resolveCatalog collapses a contested role to a single active
 * item, and a line whose SKU was deactivated has an itemId that is simply not
 * in the result. Treating that as unresolved would make the venue unsaveable
 * and offer only "Remove these lines and save", destroying the behaviour the
 * (inactive) badge and swapOptionsFor's empty-family branch exist to support.
 *
 * ACCEPTED CONSEQUENCE, stated because nothing here enforces it: localStorage
 * has no `on delete restrict`. 0001_schema.sql:39 is a real backstop this store
 * does not have, so a blob can name an item_id that is not in the catalog at
 * all — a rebuilt environment, or an item genuinely deleted rather than
 * deactivated. That line renders "No active item mapped for …" with no admin
 * present to repair it. It is left in place rather than dropped: a line the
 * user can see and swap beats one that vanishes silently, and it matches how
 * the database path treats a line whose item was merely deactivated.
 */
export async function localSaveVenueAndLines(
  venue: Venue,
  lines: StoredLine[],
  catalog: Item[],
  choices: VenueItemChoice[],
): Promise<{ venue: Venue; lines: StoredLine[]; choices: VenueItemChoice[] }> {
  // Raised BEFORE the read and the write, so the failure is total rather than
  // partial — the same ordering the RPC path uses, through the same helper.
  const resolved = resolveLineItems(lines, catalog)

  const existing = load(venue.id)   // throws venue_not_found, like 0013:50

  // The lock must fail LOUD, never open — see 0008, where a caller that dropped
  // the baseline used to skip the concurrency check entirely.
  //
  // Compared as strings, verbatim, exactly like `is distinct from` in 0013:53.
  // Parsing either side would make two values that are the same instant compare
  // equal after a truncating round trip, which is a lock that quietly stops
  // locking.
  const storedAt = String(existing.venue.updated_at ?? '')
  if (storedAt !== venue.updatedAt) {
    // The CURRENT stored value, not an empty string: "Overwrite theirs" rebases
    // on it and re-issues the save, and an empty one makes that button conflict
    // forever. savedByEmail is null because there are no accounts here, and
    // local:true is what lets the dialog say so — the other writer is another
    // tab in this browser.
    throw new VenueConflictError(null, storedAt, true)
  }

  // venue_lines has no role_key column: 0013:92 joins items to supply it, and
  // here the catalog IS that join.
  const roleKeyFor = new Map(catalog.map(i => [i.id, i.roleKey]))

  const lineRows: Record<string, unknown>[] = resolved.map(({ line, itemId }, index) => ({
    // A fresh uuid on every save, exactly like the RPC — 0013:67 deletes every
    // row for the venue before re-inserting, so no line id survives a save
    // there either. This is also what replaces mergeRecalculation's
    // `new:<roleKey>` and MaterialsTable's `new-manual:<itemId>:<Date.now()>`,
    // without which two manual adds inside one millisecond edit each other's
    // row.
    id: crypto.randomUUID(),
    venue_id: venue.id,
    item_id: itemId,
    // `?? line.roleKey` covers the one case the RPC's join covers and this Map
    // cannot: 0013 joins the WHOLE items table, while this catalog is narrowed
    // to active items, so a line whose SKU was deactivated is absent from it.
    // Without the fallback that line comes back roleKey: null and the next
    // Recalculate drops it.
    role_key: roleKeyFor.get(itemId) ?? line.roleKey,
    // The TBD sentinel is stored as the flag, never as the value.
    qty: typeof line.qty === 'number' ? line.qty : 0,
    qty_tbd: line.qty === 'TBD',
    origin_role_key: line.originRoleKey,
    // Print order is the on-screen order, so this is the array index and not
    // the stored sortOrder.
    sort_order: index,
    source: line.source,
    suppressed: line.suppressed,
    note: line.note,
  }))

  // Ordered by role_key, matching 0013:100. runSave compares the returned set
  // against its snapshot, so an unstable order would read as a change and leave
  // the venue dirty the instant it was saved.
  const choiceRows = choices
    .map(c => ({ venue_id: venue.id, role_key: c.roleKey, item_id: c.itemId }))
    .sort((a, b) => (a.role_key < b.role_key ? -1 : a.role_key > b.role_key ? 1 : 0))

  const venueRow: Record<string, unknown> = {
    // Spread first so created_at survives: 0006's stamp_venue restores
    // old.created_at on every UPDATE for exactly this reason, and the Venues
    // list is ordered by it.
    ...existing.venue,
    id: venue.id,
    name: venue.name,
    courts: venue.courts,
    tier: venue.tier,
    security_cameras: venue.securityCameras,
    kisi_doors: venue.kisiDoors,
    extended_retention: venue.extendedRetention,
    backup_internet: venue.backupInternet,
    updated_at: mintUpdatedAt(storedAt),
    created_by_email: null,
    updated_by_email: null,
  }

  // ONE setItem. The venue, its lines and its choices commit together or not
  // at all — a second write here is the split write 0007 and 0013 were written
  // to eliminate.
  write(venue.id, {
    schema: SCHEMA, venue: venueRow, lines: lineRows, choices: choiceRows,
  })

  return {
    venue: venueFromRow(venueRow),
    lines: lineRows.map(lineFromRow),
    choices: choiceRows
      .map(choiceFromRow)
      .filter((c): c is VenueItemChoice => c !== null),
  }
}
