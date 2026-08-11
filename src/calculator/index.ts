import type { VenueInputs, Item, BomResult, CalculatedLine, Warning } from './types'
import { evaluateGates } from './gates'
import { totalPorts, pickGateway, planSwitches } from './network'
import { planPatchPanels, planCat6 } from './cables'
import { sumRackU, pickRack } from './rack'
import { planSsd } from './storage'
import { planPower } from './power'
import { planPerCourt } from './perCourt'
import { checkPoeBudget } from './poe'
import type { RoleKey } from './roleKeys'

// Roles that draw PoE. Used only to decide whether a missing wattage is worth
// complaining about — a rack or a cable having no wattage is normal.
const POE_BEARING = new Set<RoleKey>([
  'replay_camera', 'security_camera', 'ipad_poe_adapter', 'access_point',
])

export function calculateBOM(inputs: VenueInputs, catalog: Item[]): BomResult {
  const gate = evaluateGates(inputs)
  if (gate.blocked) return { lines: [], warnings: gate.warnings }

  const warnings: Warning[] = [...gate.warnings]
  const ports = totalPorts(inputs)
  const switches = planSwitches(inputs, ports)

  if (switches.overCapacity) {
    return {
      lines: [],
      warnings: [...warnings, {
        code: 'PORT_CEILING',
        level: 'error',
        message:
          `${ports} ports exceeds the 264-port ceiling in the sizing doc. ` +
          'This venue needs a design decision, not a formula.',
      }],
    }
  }

  const lines: CalculatedLine[] = []

  lines.push({
    roleKey: pickGateway(inputs),
    qty: 1,
    formula: inputs.courts === 1 ? 'single-court venue' : '1 per venue',
  })

  if (switches.count24 > 0) {
    lines.push({
      roleKey: switches.roleKey24,
      qty: switches.count24,
      formula: `${ports} ports`,
    })
  }
  if (switches.count48 > 0) {
    lines.push({
      roleKey: 'switch_48_pro',
      qty: switches.count48,
      formula: `${ports} ports`,
    })
  }

  lines.push(...planPatchPanels(switches))
  lines.push(...planCat6(ports))
  lines.push(...planPower())
  lines.push(...planPerCourt(inputs))

  const ssd = planSsd(inputs)
  lines.push(ssd.line)
  if (ssd.needsLargeSku) {
    warnings.push({
      code: 'SSD_LARGE_SKU',
      level: 'warn',
      message:
        'The Kingston XS1000 family stops at 2TB — a 4TB build needs a ' +
        'different SKU (XS2000, Crucial X9/X10 Pro, or T7 Shield). The doc ' +
        'treats this size as a manual override.',
    })
  }

  // Rack is sized from everything above, so it is appended last.
  const rack = pickRack(sumRackU(lines, catalog))
  lines.push({ roleKey: rack.roleKey, qty: 1, formula: 'from total rack U' })
  if (rack.over25) {
    warnings.push({
      code: 'RACK_OVER_25U',
      level: 'warn',
      message: 'Gear exceeds 25U — beyond the sizing doc\'s bracket table.',
    })
  }

  warnings.push(...checkPoeBudget(lines, catalog, switches))

  warnings.push({
    code: 'ACCESS_POINTS_MANUAL',
    level: 'warn',
    message:
      'Access point count is not derivable — it is a coverage decision. ' +
      'The materials list carries a TBD line; replace it before ordering.',
  })

  // venue-sizing.md § Per-court AV + kiosk quantities — the source defers this
  // quantity for every brand Kosmas deploys, so it is always a TBD line.
  warnings.push({
    code: 'FENCE_BRACKET_MANUAL',
    level: 'warn',
    message:
      'The iPad fence bracket is not auto-sized — the source defers it. The ' +
      'materials list carries a TBD line; specify the mount before ordering.',
  })

  // A countable line whose item has no recorded wattage contributes 0 to the
  // PoE total, which would make an over-budget venue look safe. Silence there
  // is the dangerous failure mode, so it is surfaced.
  const poeUnknown = lines
    .filter(l => typeof l.qty === 'number' && l.qty > 0)
    .map(l => catalog.find(i => i.roleKey === l.roleKey))
    .filter(i => i && i.poeWatts === null && POE_BEARING.has(i.roleKey as RoleKey))
    .map(i => i!.name)
  if (poeUnknown.length > 0) {
    warnings.push({
      code: 'POE_DATA_INCOMPLETE',
      level: 'warn',
      message:
        `No PoE wattage recorded for: ${poeUnknown.join(', ')}. ` +
        'The budget check is understating the load until these are filled in.',
    })
  }

  const mapped = new Set(
    catalog.filter(i => i.isActive && i.roleKey).map(i => i.roleKey as RoleKey),
  )
  const unmapped = [...new Set(lines.map(l => l.roleKey))]
    .filter(r => !mapped.has(r))
  if (unmapped.length > 0) {
    warnings.push({
      code: 'UNMAPPED_ROLE',
      level: 'warn',
      message: `No active catalog item for: ${unmapped.join(', ')}.`,
    })
  }

  return { lines, warnings }
}

export type { BomResult }
