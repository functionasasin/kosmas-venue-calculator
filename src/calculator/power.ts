import type { CalculatedLine } from './types'

/**
 * venue-sizing.md § UPS — PH overrides the count-based picker entirely and
 * ships the KSTAR MP RT 3K S on every Pro and Autonomous+ deployment.
 *
 * The rack PDU is skipped — the UPS socket plate handles distribution. The two
 * C14-to-Universal adapter plugs the source pairs with it were removed on
 * 2026-08-11 as out of scope for Kosmas, so the UPS is the whole power line.
 */
export function planPower(): CalculatedLine[] {
  return [
    { roleKey: 'ups', qty: 1, formula: '1 per venue' },
  ]
}
