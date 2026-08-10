import type { Tier } from '@/calculator/types'

/**
 * Display names for the stored tier keys. Nothing is derived here.
 *
 * A previous version resolved Pro vs Pro+ from the door and camera counts,
 * on the theory that Pro+ was "Pro with hardware added". That was wrong: the
 * capabilities matrix gives Pro Door Access "No", so a Pro venue cannot have
 * doors at all and there is nothing to infer from. Pro+ is chosen, not
 * detected — see the gates in calculator/gates.ts, which enforce it.
 */
const NAMES: Record<Tier, string> = {
  basic_plus: 'Basic+',
  pro: 'Pro',
  pro_plus: 'Pro+',
  autonomous: 'Autonomous',
  autonomous_plus: 'Autonomous+',
}

export const tierLabel = (tier: Tier): string => NAMES[tier]
