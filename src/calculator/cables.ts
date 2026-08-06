import type { CalculatedLine } from './types'
import type { SwitchPlan } from './network'

/**
 * venue-sizing.md § Patch panel count
 * Canonical is (24-port switches) + (48-port switches x 2). The PH BOM
 * substitutes a single AD-LINK 48-port panel for each pair of 24-port panels,
 * so the count is one panel per switch of the matching size.
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
 * 0.5M = total ports + 2. The 1M and 3M counts are PH-bumped from the
 * canonical 1 to 2, so field damage doesn't require a re-ship.
 */
export function planCat6(ports: number): CalculatedLine[] {
  return [
    { roleKey: 'cat6_0m5', qty: ports + 2, formula: `${ports} + 2` },
    { roleKey: 'cat6_1m', qty: 2, formula: '2 (PH spare)' },
    { roleKey: 'cat6_3m', qty: 2, formula: '2 (PH spare)' },
  ]
}
