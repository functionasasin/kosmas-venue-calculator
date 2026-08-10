import type { Tier, VenueInputs } from '@/calculator/types'

/**
 * Pro and Pro+ were merged into one stored tier on 2026-08-10, because nothing
 * in the engine ever read `tier` to size a venue — Pro+ was Pro with door
 * access or cameras added. The distinction is still real to a buyer, so it is
 * recovered for display from the inputs that constitute it rather than kept as
 * a second value someone has to remember to set.
 */
const CUSTOM_ACCESS_LABEL = 'Pro+'

const NAMES: Record<Tier, string> = {
  basic_plus: 'Basic+',
  pro: 'Pro',
  autonomous: 'Autonomous',
  autonomous_plus: 'Autonomous+',
}

/** True when the venue has the access/monitoring hardware that made it Pro+. */
export const hasCustomAccess = (v: Pick<VenueInputs, 'kisiDoors' | 'securityCameras'>) =>
  v.kisiDoors > 0 || v.securityCameras > 0

/**
 * The label for a venue as configured. Only `pro` is conditional: it reads
 * "Pro+" once doors or cameras are on the venue, "Pro" otherwise. Every other
 * tier is a fixed name.
 */
export function tierLabel(
  v: Pick<VenueInputs, 'tier' | 'kisiDoors' | 'securityCameras'>,
): string {
  if (v.tier === 'pro' && hasCustomAccess(v)) return CUSTOM_ACCESS_LABEL
  return NAMES[v.tier]
}

/**
 * The label for a tier in the picker. Distinct from `tierLabel` on purpose: the
 * picker offers a choice, and at the moment of choosing there is no answer yet
 * to whether doors or cameras exist — so Pro is offered as the pair it covers.
 */
export function tierOptionLabel(tier: Tier): string {
  return tier === 'pro' ? 'Pro / Pro+' : NAMES[tier]
}
