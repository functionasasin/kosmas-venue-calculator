import type { VenueInputs, Item, BomResult, CalculatedLine, Warning } from './types'
import { evaluateGates } from './gates'
import { totalPorts, pickGateway, planSwitches } from './network'
import { planPatchPanels, planCat6 } from './cables'
import { sumRackU, pickRack } from './rack'
import { planSsd } from './storage'
import { planUps } from './power'
import { planPerCourt } from './perCourt'
import { checkPoeBudget } from './poe'
import { planKisi } from './kisi'
import type { RoleKey } from './roleKeys'

// Roles that draw PoE. Used only to decide whether a missing wattage is worth
// complaining about — a rack or a cable having no wattage is normal.
const POE_BEARING = new Set<RoleKey>([
  'replay_camera', 'security_camera', 'ipad_poe_adapter', 'access_point',
  'kisi_reader',
])

export function calculateBOM(inputs: VenueInputs, catalog: Item[]): BomResult {
  const gate = evaluateGates(inputs)
  if (gate.blocked) return { lines: [], warnings: gate.warnings }

  const warnings: Warning[] = [...gate.warnings]
  const kisi = planKisi(inputs)
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
  lines.push(...planCat6(ports, inputs.kisiDoors))
  lines.push(...planPerCourt(inputs))

  // tiers-reference.md § Autonomous Kisi kit — the hardware that makes a venue
  // Autonomous, so it belongs on the list rather than in a "add it yourself"
  // note. Controller quantity implements the doc's intent (1 per 4 doors), not
  // `F37`, which tests the empty cell Z16 and returns 1 for every venue.
  if (kisi.readers > 0) {
    lines.push({
      roleKey: 'kisi_controller',
      qty: kisi.controllers,
      formula: `1 per 4 doors (${kisi.readers} doors)`,
    })
    lines.push({
      roleKey: 'kisi_reader',
      qty: kisi.readers,
      formula: `1 per door (${kisi.readers})`,
    })
  }

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

  // The UPS is sized from every line above it, so it goes after them — but
  // before the rack, because it is 2U of the rack's own total. Its rating is a
  // property of the whole venue rather than of any one device, which is why it
  // cannot be emitted alongside the gear the way every other line is.
  const ups = planUps(inputs, lines, catalog)
  lines.push(ups.line)

  if (ups.overLadder) {
    warnings.push({
      code: 'UPS_OVER_LADDER',
      level: 'warn',
      message:
        `This venue needs ${Math.round(ups.requiredVa)} VA, past the 3000 VA ` +
        'top of the PH ladder. The line carries 3000 VA, which is NOT enough ' +
        '— it needs a larger unit or a second UPS, and that is a design ' +
        'decision rather than a formula output.',
    })
  }

  if (ups.nvrUnbanded) {
    warnings.push({
      code: 'UPS_NVR_UNBANDED',
      level: 'warn',
      message:
        `${inputs.securityCameras} security cameras is past the 60 the NVR ` +
        'band table covers, so the UPS load counts only 320 W of NVR and is ' +
        'understated. Size the recording hardware by hand and re-check.',
    })
  }

  // UPS_CAMERA_ASSUMPTION and DOC_REPLAY_WATTS were here until 2026-08-20. The
  // warning compared the catalog's replay camera against PodPlay's 17.5 W
  // standard and spoke when the two produced different rungs. It existed
  // solely because the catalog held ONE camera while venues did not share one,
  // so the tool could not know which a venue would get. It can now —
  // venue_item_choices, resolved by src/lib/resolveCatalog.ts — and a warning
  // hedging an answered question is noise on every correctly-specced venue.

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

  warnings.push(...checkPoeBudget(lines, catalog, switches, kisi))

  // venue-sizing.md § Kisi port accounting — putting readers on the gateway is
  // what keeps the 24-port build valid at 8 courts, but it deviates from
  // PodPlay's own port-labeling convention rather than following it. It has to
  // be written down per venue, or the installer will not reproduce it.
  if (kisi.readers > 0) {
    warnings.push({
      code: 'KISI_READER_PLACEMENT',
      level: 'warn',
      message:
        `${kisi.readersOnUdm} of ${kisi.readers} Kisi reader(s) go on the ` +
        'UDM-SE\'s PoE ports' +
        (kisi.readersOnSwitch > 0
          ? `, and ${kisi.readersOnSwitch} overflow onto the switch. `
          : '. ') +
        'PodPlay\'s guides put every reader on the switch — this is a ' +
        'deliberate Kosmas deviation that an installer following the guide ' +
        'will not make, so record it for this venue. Tag each UDM port ' +
        'carrying a reader onto the ACCESS CONTROL VLAN.',
    })

    const switchCount = switches.count24 + switches.count48
    const spare = switches.count24 * 24 + switches.count48 * 48 - ports
    if (switchCount > 0 && spare <= 0) {
      warnings.push({
        code: 'KISI_SWITCH_HEADROOM',
        level: 'warn',
        message:
          'The switch has no free ports left. Take the 48-port instead if the ' +
          'venue needs spare capacity, if the door count may grow, or if you ' +
          'want every reader on the switch per PodPlay\'s convention.',
      })
    }
  }

  warnings.push({
    code: 'ACCESS_POINTS_MANUAL',
    level: 'warn',
    message:
      'Access point count is not derivable — it is a coverage decision. ' +
      'The materials list carries a TBD line; replace it before ordering.',
  })

  // FENCE_BRACKET_MANUAL was here until 2026-08-17. It existed only to explain
  // the fence bracket's TBD line; that line is gone (the locking wall mount kit
  // includes the hardware), so the warning had nothing left to point at.

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
