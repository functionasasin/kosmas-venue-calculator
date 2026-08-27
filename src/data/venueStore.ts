import type { Item, VenueInputs } from '@/calculator/types'
import type { Venue } from './venues'
import {
  deleteVenue as dbDeleteVenue, getVenue as dbGetVenue,
  listVenues as dbListVenues, saveVenue as dbSaveVenue,
} from './venues'
import {
  listLines as dbListLines, saveVenueAndLines as dbSaveVenueAndLines,
} from './venueLines'
import {
  listChoices as dbListChoices, type VenueItemChoice,
} from './venueItemChoices'
import {
  isLocalVenueId, localDeleteVenue, localGetVenue, localListChoices,
  localListLines, localListVenues, localSaveVenue, localSaveVenueAndLines,
  type UnreadableVenue,
} from './localVenues'
import type { StoredLine } from './venueTypes'

/**
 * The one module the screens import venue storage from.
 *
 * DISPATCH IS ON THE VENUE'S ID, NEVER ON THE SESSION. A local venue's id
 * carries a `local_` prefix; every other id is a uuid. The five functions below
 * are pure functions of that prefix, so a local id can never reach Supabase and
 * a uuid can never reach localStorage.
 *
 * A session predicate would be a bug, not a shortcut. The session can vanish
 * mid-screen — Supabase fires SIGNED_OUT on refresh-token failure and on
 * sign-out in another tab (AuthProvider.tsx:18-27) — and a mounted VenueDetail
 * holding a DATABASE venue would then route its next save into localStorage,
 * write it there, and toast "Saved" (VenueDetail.tsx:375-383) while the
 * database row went untouched. That is the HardwareChoices failure again: two
 * paths, the wrong one reporting success. With id dispatch the same situation
 * fails loudly — the database path errors and the existing catch surfaces it.
 *
 * The two functions that DO take the session take it as an explicit argument;
 * see below.
 *
 * ONE RESOLVER rather than five hand-written prefix checks: the five functions
 * below all route through backendFor, so the prefix rule is stated once and
 * cannot be applied to four of the five places by accident. A third backend —
 * share links are the obvious one — would edit backendFor and the VenueBackend
 * implementations, and nothing else in this half of the file. (listVenues and
 * saveVenue sit outside it and would still need their own handling; they have
 * no id to dispatch on.)
 */

interface VenueBackend {
  getVenue(id: string): Promise<Venue>
  listLines(id: string): Promise<StoredLine[]>
  listChoices(id: string): Promise<VenueItemChoice[]>
  saveVenueAndLines(
    venue: Venue, lines: StoredLine[], catalog: Item[], choices: VenueItemChoice[],
  ): Promise<{ venue: Venue; lines: StoredLine[]; choices: VenueItemChoice[] }>
  deleteVenue(id: string): Promise<void>
}

const localBackend: VenueBackend = {
  getVenue: localGetVenue,
  listLines: localListLines,
  listChoices: localListChoices,
  saveVenueAndLines: localSaveVenueAndLines,
  deleteVenue: localDeleteVenue,
}

const databaseBackend: VenueBackend = {
  getVenue: dbGetVenue,
  listLines: dbListLines,
  listChoices: dbListChoices,
  saveVenueAndLines: dbSaveVenueAndLines,
  deleteVenue: dbDeleteVenue,
}

// The database is the DEFAULT, not a second prefix: it owns every id that is
// not claimed, which is what makes an unrecognised id fail against Postgres
// rather than silently resolving to a store that has never heard of it.
const backendFor = (id: string): VenueBackend =>
  isLocalVenueId(id) ? localBackend : databaseBackend

export const getVenue = (id: string): Promise<Venue> =>
  backendFor(id).getVenue(id)

export const listLines = (id: string): Promise<StoredLine[]> =>
  backendFor(id).listLines(id)

export const listChoices = (id: string): Promise<VenueItemChoice[]> =>
  backendFor(id).listChoices(id)

export const deleteVenue = (id: string): Promise<void> =>
  backendFor(id).deleteVenue(id)

/**
 * Keyed on the VENUE's id, which is the id being written — not on anything the
 * caller supplies separately, so the routing cannot disagree with the payload.
 */
export const saveVenueAndLines = (
  venue: Venue, lines: StoredLine[], catalog: Item[], choices: VenueItemChoice[],
): Promise<{ venue: Venue; lines: StoredLine[]; choices: VenueItemChoice[] }> =>
  backendFor(venue.id).saveVenueAndLines(venue, lines, catalog, choices)

export interface VenueList {
  venues: Venue[]
  /**
   * Local blobs that could not be read — corrupt, truncated, or written by a
   * newer build. Carried out as DATA rather than dropped, because they are
   * surfaced and never auto-deleted: each one is the user's only copy of that
   * venue. Plan 3 renders them; nothing does today, which is why this list is
   * allowed to be non-empty and inert.
   */
  unreadable: UnreadableVenue[]
}

/**
 * The two lists, concatenated. `signedIn` is an explicit argument rather than a
 * session read inside the store — the same rule listItems follows since 0017,
 * and what lets the contract suite parameterise without mocking the auth SDK.
 *
 * ORDER: local rows first, then database rows, each half newest-first. The
 * database half is ordered by created_at in SQL (venues.ts:54) and the local
 * half by the same column in localListVenues, but the two cannot be interleaved
 * — Venue carries no createdAt field, so nothing downstream could re-sort a
 * merged list even if it wanted to. Two groups that read as two groups is the
 * better outcome anyway: it pairs with Plan 3's "This browser" badge, so an
 * admin who was silently signed out can see that the venue they just built went
 * somewhere different from the rest.
 */
export async function listVenues(signedIn: boolean): Promise<VenueList> {
  const local = localListVenues()
  const db = signedIn ? await dbListVenues() : []
  return { venues: [...local.venues, ...db], unreadable: local.unreadable }
}

/**
 * CREATE only, on both backends. Updates go through saveVenueAndLines, which is
 * transactional and carries the optimistic-lock baseline.
 *
 * This is the ONE place the session decides where a venue lives, and it can be:
 * there is no venue yet, so there is no id to dispatch on. Every write after
 * this one keys off the id this call minted, which is why a session that
 * expires mid-edit can no longer move a venue between stores.
 */
export function saveVenue(
  v: Partial<VenueInputs> & { name: string },
  signedIn: boolean,
): Promise<Venue> {
  return signedIn ? dbSaveVenue(v) : localSaveVenue(v)
}

// The store's public prefix predicate. NOT for the conflict dialog — that reads
// `VenueConflictError.local`, because a screen should not have to ask where a
// venue lives. This is for a surface that legitimately wants to SAY where it
// lives: Plan 3's "This browser" badge on the Venues list (spec §2.4), which is
// its only intended consumer.
export { isLocalVenueId } from './localVenues'
