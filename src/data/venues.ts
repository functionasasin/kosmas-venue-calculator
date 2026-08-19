import { supabase } from '@/lib/supabase'
import type { VenueInputs, Tier } from '@/calculator/types'
import type { Tables } from '@/lib/database.types'

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
const LIVE: readonly Tier[] = [
  'basic', 'basic_plus', 'pro', 'autonomous', 'autonomous_plus',
]

export const readTier = (v: unknown): Tier =>
  LIVE.includes(v as Tier) ? (v as Tier) : 'pro'

const fromRow = (r: Tables<'venues'>): Venue => ({
  id: r.id,
  name: r.name,
  courts: r.courts,
  tier: readTier(r.tier),
  securityCameras: r.security_cameras,
  kisiDoors: r.kisi_doors,
  extendedRetention: r.extended_retention,
  backupInternet: r.backup_internet,
  updatedAt: r.updated_at,
  createdByEmail: r.created_by_email,
  updatedByEmail: r.updated_by_email,
})

export async function listVenues(): Promise<Venue[]> {
  const { data, error } = await supabase
    .from('venues').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export async function getVenue(id: string): Promise<Venue> {
  const { data, error } = await supabase
    .from('venues').select('*').eq('id', id).single()
  if (error) throw error
  return fromRow(data)
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
  return fromRow(data)
}
