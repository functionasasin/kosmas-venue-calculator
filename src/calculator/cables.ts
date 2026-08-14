import type { CalculatedLine } from './types'
import type { SwitchPlan } from './network'

/**
 * venue-sizing.md § Patch panel count
 * Canonical is (24-port switches) + (48-port switches x 2). The PH BOM
 * substitutes a single 48-port panel for each pair of 24-port panels, so the
 * count is one panel per switch of the matching size. Both panels are
 * deliberately unbranded — what the catalog pins is the pass-through coupler
 * requirement, not a SKU.
 */
export function planPatchPanels(plan: SwitchPlan): CalculatedLine[] {
  const lines: CalculatedLine[] = []

  if (plan.count24 > 0) {
    lines.push({
      roleKey: 'patch_panel_24',
      qty: plan.count24,
      formula: `1 per 24-port switch (${plan.count24})`,
    })
  }

  if (plan.count48 > 0) {
    lines.push({
      roleKey: 'patch_panel_48',
      qty: plan.count48,
      formula: `1 per 48-port switch (${plan.count48}) — PH deviation`,
    })
  }

  return lines
}

/**
 * venue-sizing.md § Cat6 patch cables
 * 0.5M = total ports + 2, the panel-front-to-switch run. The 1M and 3M counts
 * are PH-bumped from the canonical 1 to 2, so field damage doesn't require a
 * re-ship; the 3M carries that spare plus one run per Kisi door.
 *
 * The 0.5M basis is deliberately NOT the sheet's `F10 = Z25 + 2`. `Z25` sums
 * every port in the rack — the PDU, the Mac mini and, on Autonomous, the Kisi
 * rows — while INVENTORY MASTER scopes this cable to "for switch" and serves
 * the Mac mini and PDU off the 3' line, Kisi off the 10'. `Z25 + 2` therefore
 * counts ports that never receive a 1' cable.
 *
 * The 3M is INVENTORY MASTER's "10' patch cable for Kisi". The sheet's `F12`
 * is hardcoded to 1 whatever the door count, which under-orders every
 * multi-door venue, so the doc sizes it at 1 per door instead.
 */
export function planCat6(ports: number, kisiDoors: number): CalculatedLine[] {
  return [
    { roleKey: 'cat6_0m5', qty: ports + 2, formula: `${ports} + 2` },
    { roleKey: 'cat6_1m', qty: 2, formula: '2 (PH spare)' },
    {
      roleKey: 'cat6_3m',
      qty: 2 + kisiDoors,
      formula: kisiDoors > 0
        ? `2 (PH spare) + 1 per Kisi door (${kisiDoors})`
        : '2 (PH spare)',
    },
  ]
}
