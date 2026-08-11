import type { Tier } from '@/calculator/types'

/**
 * Display names for the stored tier keys. Nothing is derived here — the tier is
 * whatever was chosen on the venue, never inferred from its hardware counts.
 *
 * That matters most for Basic vs Basic+, which are identical in hardware and
 * separated only by software, so there is nothing to infer them from.
 */
const NAMES: Record<Tier, string> = {
  basic: 'Basic',
  basic_plus: 'Basic+',
  pro: 'Pro',
  autonomous: 'Autonomous',
  autonomous_plus: 'Autonomous+',
}

export const tierLabel = (tier: Tier): string => NAMES[tier]
