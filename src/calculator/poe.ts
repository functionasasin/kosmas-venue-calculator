import type { CalculatedLine, Item, Warning, WarningLevel } from './types'
import { isCountable } from './types'
import type { SwitchPlan } from './network'
import type { KisiPlan } from './kisi'
import type { RoleKey } from './roleKeys'

// venue-sizing.md § Sheet inconsistency to be aware of — per-switch PoE
// budgets. The gateway's 180W is deliberately excluded: in a switched venue
// nothing PoE connects to the gateway, so counting it overstates the budget.
const BUDGET_24 = 400
const BUDGET_48 = 600

// ...except in a 1-court venue, which is spec'd with NO switch at all. There
// the court gear runs off the UDM-SE's own PoE and 180W is the entire budget.
// Treating that as "no budget" would skip the check on the one configuration
// with the least headroom.
const GATEWAY_POE = 180

// The doc's densest blessed standard config — 14 courts — sits at 71%, so
// the warn band must start above it or every legitimate max-size venue
// throws a warning on day one.
const WARN_AT = 0.8
const CRITICAL_AT = 0.9

export function checkPoeBudget(
  lines: CalculatedLine[],
  catalog: Item[],
  plan: SwitchPlan,
  kisi: KisiPlan,
): Warning[] {
  const switchBudget = plan.count24 * BUDGET_24 + plan.count48 * BUDGET_48
  const switched = switchBudget > 0
  const budget = switched ? switchBudget : GATEWAY_POE

  const byRole = new Map(
    catalog.filter(i => i.roleKey).map(i => [i.roleKey as RoleKey, i]),
  )

  const total = lines.reduce((sum, line) => {
    if (!isCountable(line.qty)) return sum
    const watts = byRole.get(line.roleKey)?.poeWatts ?? 0
    return sum + watts * line.qty
  }, 0)

  // Readers that landed on the UDM-SE draw from the gateway's own 180W, not
  // from the switch. The BOM carries them as one line because they are one
  // SKU, so without this split their whole load would be charged to the switch
  // budget and overstate it. In an unswitched venue there is nothing to split:
  // the gateway budget is already the one being measured.
  const readerWatts = byRole.get('kisi_reader')?.poeWatts ?? 0
  const udmReaderLoad = switched ? kisi.readersOnUdm * readerWatts : 0
  const load = total - udmReaderLoad

  const ratio = load / budget
  const level: WarningLevel =
    ratio > CRITICAL_AT ? 'critical' : ratio >= WARN_AT ? 'warn' : 'info'

  const pct = Math.round(ratio * 100)
  const pooled =
    plan.count24 > 0 && plan.count48 > 0
      ? ' Budget is pooled across switches — verify no single switch is ' +
        'individually over.'
      : ''

  const onGateway =
    udmReaderLoad > 0
      ? ` A further ${Math.round(udmReaderLoad)}W of Kisi readers sits on the ` +
        `UDM-SE's own ${GATEWAY_POE}W supply and is not counted here.`
      : ''

  return [{
    code: 'POE_BUDGET',
    level,
    message:
      `PoE load ${Math.round(load)}W of ${budget}W (${pct}%).${pooled}${onGateway}`,
  }]
}
