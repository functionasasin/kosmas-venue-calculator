import { supabase } from '@/lib/supabase'
import type { VenueInputs, Tier } from '@/calculator/types'

export interface Venue extends VenueInputs {
  id: string
  name: string
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

const fromRow = (r: Record<string, unknown>): Venue => ({
  id: r.id as string,
  name: r.name as string,
  courts: r.courts as number,
  tier: readTier(r.tier),
  securityCameras: r.security_cameras as number,
  kisiDoors: r.kisi_doors as number,
  extendedRetention: r.extended_retention as boolean,
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

export async function saveVenue(v: Partial<Venue> & { name: string }) {
  const row = {
    ...(v.id ? { id: v.id } : {}),
    name: v.name,
    courts: v.courts ?? 1,
    tier: v.tier ?? 'pro',
    security_cameras: v.securityCameras ?? 0,
    kisi_doors: v.kisiDoors ?? 0,
    extended_retention: v.extendedRetention ?? false,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('venues').upsert(row).select().single()
  if (error) throw error
  return fromRow(data)
}
