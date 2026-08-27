import { supabase } from '@/lib/supabase'
import type { VenueInputs, Tier } from '@/calculator/types'
import { TIERS } from '@/lib/tierLabel'
import { VenueMissingError } from './venueTypes'

export interface Venue extends VenueInputs {
  id: string
  name: string
  /**
   * OPAQUE. Sent back verbatim as save_venue's optimistic-lock baseline.
   * timestamptz is microsecond-precision; a round trip through a JS Date
   * truncates to milliseconds, after which the baseline never matches and
   * EVERY save conflicts — a failure that reads as a broken lock rather than
   * a formatting bug. Never parse or reformat this. Format a copy for display.
   */
  updatedAt: string
  createdByEmail: string | null
  updatedByEmail: string | null
}

// `venues.tier` is plain `text` with no check constraint, so it can hold a tier
// the app no longer offers — 'pro_plus', removed 2026-08-11, is the live
// example. An unrecognised value makes the tier <select> render an option that
// does not exist, so the form silently shows some other tier as current and the
// mismatch only surfaces on the next save.
//
// The fallback is a guard, not a translation: it does not claim the old tier
// meant Pro. It only guarantees a renderable value. If such a row carries doors
// or cameras, Pro's gates block the calculation — which is the point, since the
// tier then has to be re-picked deliberately rather than assumed.
//
// The list itself is TIERS — the same one the two tier pickers are built from,
// not a third copy typed out beside them. What is offered and what is accepted
// back have to be the same set, and a hand-copied list makes that a convention
// rather than a fact.
export const readTier = (v: unknown): Tier =>
  TIERS.includes(v as Tier) ? (v as Tier) : 'pro'

// One mapper, so a venue returned by the RPC and one returned by a SELECT can
// never disagree about how a row becomes a Venue.
export const venueFromRow = (r: Record<string, unknown>): Venue => ({
  id: r.id as string,
  name: r.name as string,
  courts: r.courts as number,
  tier: readTier(r.tier),
  securityCameras: r.security_cameras as number,
  kisiDoors: r.kisi_doors as number,
  extendedRetention: r.extended_retention as boolean,
  backupInternet: r.backup_internet as boolean,
  updatedAt: r.updated_at as string,
  createdByEmail: (r.created_by_email as string | null) ?? null,
  updatedByEmail: (r.updated_by_email as string | null) ?? null,
})

export async function listVenues(): Promise<Venue[]> {
  const { data, error } = await supabase
    .from('venues').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(venueFromRow)
}

export async function getVenue(id: string): Promise<Venue> {
  const { data, error } = await supabase
    .from('venues').select('*').eq('id', id).single()
  // PGRST116 is `.single()` matching no row. That is not an exceptional
  // condition here: the venues policy is `to authenticated`, so an anonymous
  // read of any venue returns zero rows rather than 42501, and every venue URL
  // is now bookmarkable by anyone.
  if (error?.code === 'PGRST116') throw new VenueMissingError()
  if (error) throw error
  return venueFromRow(data)
}

/**
 * Hard delete. `venue_lines.venue_id` is `on delete cascade`, so the venue's
 * whole materials list goes with it and there is nothing to clean up after —
 * and nothing to recover either. Callers must confirm first.
 *
 * Not admin-gated, deliberately: the `venues` RLS policy is
 * `for all to authenticated using (true)`, so every signed-in account can
 * already delete through the API. A role check here would look like a boundary
 * without being one — the same trap `0002_rls.sql` warns about.
 */
export async function deleteVenue(id: string) {
  const { error } = await supabase.from('venues').delete().eq('id', id)
  if (error) throw error
}

/**
 * CREATE only. Updates go through saveVenueAndLines, which is transactional and
 * carries the optimistic-lock baseline.
 *
 * This was an upsert. That left a second write path into `venues`: an id in the
 * payload took the ON CONFLICT DO UPDATE branch with no baseline check and no
 * row lock, so a concurrent save could still be lost — the same trap that
 * justifies deleting saveLines. It inserts, and now cannot be anything else.
 *
 * `updated_at` is no longer sent: 0006's trigger owns it, and it is what the
 * lock compares against.
 */
export async function saveVenue(
  v: Partial<VenueInputs> & { name: string },
): Promise<Venue> {
  const row = {
    name: v.name,
    courts: v.courts ?? 1,
    tier: v.tier ?? 'pro',
    security_cameras: v.securityCameras ?? 0,
    kisi_doors: v.kisiDoors ?? 0,
    extended_retention: v.extendedRetention ?? false,
    backup_internet: v.backupInternet ?? false,
  }
  const { data, error } = await supabase
    .from('venues').insert(row).select().single()
  if (error) throw error
  return venueFromRow(data)
}
