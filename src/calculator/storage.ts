import type { VenueInputs, CalculatedLine } from './types'

/**
 * venue-sizing.md § Mac mini storage (replay clips)
 * 1-4 courts 1TB, 5+ 2TB, 20+ or extended retention 4TB. The doc marks the
 * 4TB row "(manual override)" — automating it is a convenience, and the
 * caller raises a warning saying so.
 */
export function planSsd(
  inputs: VenueInputs,
): { line: CalculatedLine; needsLargeSku: boolean } {
  const large = inputs.courts >= 20 || inputs.extendedRetention

  if (large) {
    return {
      line: {
        roleKey: 'replay_ssd_4tb',
        qty: 1,
        formula: inputs.extendedRetention
          ? 'extended retention'
          : `${inputs.courts} courts (20+)`,
      },
      needsLargeSku: true,
    }
  }

  const roleKey = inputs.courts >= 5 ? 'replay_ssd_2tb' : 'replay_ssd_1tb'
  return {
    line: { roleKey, qty: 1, formula: `${inputs.courts} courts` },
    needsLargeSku: false,
  }
}
