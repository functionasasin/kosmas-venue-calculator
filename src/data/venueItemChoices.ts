import { supabase } from '@/lib/supabase'
import { readRoleKey, type RoleKey } from '@/calculator/roleKeys'

/**
 * Which item this venue gets for a role key. One row per (venue, role), and
 * only for roles that have ever had more than one active item — a role with a
 * single option has nothing to pin.
 */
export interface VenueItemChoice {
  roleKey: RoleKey
  itemId: string
}

/**
 * `role_key` is unconstrained text, so the database can hand back a role the
 * app has retired. readRoleKey narrows it and the row is dropped: an
 * unrecognised role matches no formula and no picker, and carrying it as a
 * RoleKey would put a phantom entry into the saved choice set.
 */
export const choiceFromRow = (
  r: { role_key: string | null; item_id: string },
): VenueItemChoice | null => {
  const roleKey = readRoleKey(r.role_key)
  return roleKey ? { roleKey, itemId: r.item_id } : null
}

export async function listChoices(venueId: string): Promise<VenueItemChoice[]> {
  const { data, error } = await supabase
    .from('venue_item_choices')
    .select('role_key, item_id')
    .eq('venue_id', venueId)
  if (error) throw error
  return (data ?? [])
    .map(choiceFromRow)
    .filter((c): c is VenueItemChoice => c !== null)
}
