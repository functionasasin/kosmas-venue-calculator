import { supabase } from '@/lib/supabase'
import type { VenueInputs, Tier, Brand } from '@/calculator/types'

export interface Venue extends VenueInputs {
  id: string
  name: string
}

// Two tiers were removed in 2026-08 and the `tier` column is plain `text` with
// no check constraint, so rows written before then still hold the old values.
// tiers-reference.md § Basic is retired: "If you find 'Basic' ... read it as
// Basic+." Pro+ folded into Pro on the same principle. Coercing on read keeps
// them out of the Tier union — otherwise the select renders a value matching
// no option and silently displays some other tier as current.
const RETIRED: Record<string, Tier> = { basic: 'basic_plus', pro_plus: 'pro' }

export const readTier = (v: unknown): Tier =>
  RETIRED[v as string] ?? (v as Tier)

const fromRow = (r: Record<string, unknown>): Venue => ({
  id: r.id as string,
  name: r.name as string,
  courts: r.courts as number,
  tier: readTier(r.tier),
  securityCameras: r.security_cameras as number,
  kisiDoors: r.kisi_doors as number,
  brand: r.brand as Brand,
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

export async function saveVenue(v: Partial<Venue> & { name: string }) {
  const row = {
    ...(v.id ? { id: v.id } : {}),
    name: v.name,
    courts: v.courts ?? 1,
    tier: v.tier ?? 'pro',
    security_cameras: v.securityCameras ?? 0,
    kisi_doors: v.kisiDoors ?? 0,
    brand: v.brand ?? 'podplay',
    extended_retention: v.extendedRetention ?? false,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('venues').upsert(row).select().single()
  if (error) throw error
  return fromRow(data)
}
