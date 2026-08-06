import type { CalculatedLine, Item } from './types'
import { isCountable } from './types'
import type { RoleKey } from './roleKeys'

/**
 * venue-sizing.md § Rack size
 * The doc's PH U budget counts the ISP modem at 1U. It occupies rack space
 * but is supplied by the ISP, so it never appears as a purchased line — the
 * allowance has to be added explicitly or every sum is 1U light.
 */
export const ISP_MODEM_U = 1

export function sumRackU(lines: CalculatedLine[], catalog: Item[]): number {
  const byRole = new Map(
    catalog.filter(i => i.roleKey).map(i => [i.roleKey as RoleKey, i]),
  )

  const gear = lines.reduce((total, line) => {
    if (!isCountable(line.qty)) return total
    const rackU = byRole.get(line.roleKey)?.rackU ?? 0
    return total + rackU * line.qty
  }, 0)

  return gear + ISP_MODEM_U
}

/**
 * venue-sizing.md § Rack size
 * Brackets bake in headroom — 10U of gear still gets a 12U rack. The doc's
 * arms overlap at exactly 19U and resolve to 21U; that is stated explicitly
 * here because the doc flagged it for whoever ported the logic.
 */
export function pickRack(totalU: number): { roleKey: RoleKey; over25: boolean } {
  if (totalU <= 10) return { roleKey: 'rack_12u', over25: false }
  if (totalU <= 14) return { roleKey: 'rack_16u', over25: false }
  if (totalU <= 19) return { roleKey: 'rack_21u', over25: false }
  if (totalU <= 25) return { roleKey: 'rack_27u', over25: false }
  return { roleKey: 'rack_27u', over25: true }
}
