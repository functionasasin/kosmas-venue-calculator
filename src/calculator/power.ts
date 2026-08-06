import type { CalculatedLine } from './types'

/**
 * venue-sizing.md § UPS — PH overrides the count-based picker entirely and
 * ships the KSTAR MP RT 3K S on every Pro and Autonomous+ deployment.
 *
 * venue-sizing.md § Power topology — the rack PDU is skipped; two
 * C14-to-Universal adapters cover the Mac mini and the ISP modem.
 */
export function planPower(): CalculatedLine[] {
  return [
    { roleKey: 'ups', qty: 1, formula: '1 per venue' },
    { roleKey: 'c14_adapter', qty: 2, formula: '2 per venue' },
  ]
}
