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

/**
 * Every tier, in lineup order, for the two pickers that offer them: the venue
 * rail's Tier field and the New venue dialog.
 *
 * Shared rather than declared beside each one so the two cannot fork. They very
 * nearly did — the create dialog had no picker at all and wrote a literal
 * 'pro', which is the same fork with one of the lists empty.
 *
 * Basic and Basic+ belong here even though the calculation blocks on them. The
 * tier is chosen and never inferred, so a venue that is genuinely Basic has to
 * be recordable as one; the block message is then the right answer rather than
 * a dead end.
 */
export const TIERS: Tier[] = [
  'basic', 'basic_plus', 'pro', 'autonomous', 'autonomous_plus',
]
