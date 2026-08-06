import { supabase } from '@/lib/supabase'
import type { VenueInputs, Tier, Brand } from '@/calculator/types'

export interface Venue extends VenueInputs {
  id: string
  name: string
}

const fromRow = (r: Record<string, unknown>): Venue => ({
  id: r.id as string,
  name: r.name as string,
  courts: r.courts as number,
  tier: r.tier as Tier,
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
