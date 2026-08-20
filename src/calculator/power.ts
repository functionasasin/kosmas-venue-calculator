import type { CalculatedLine, Item, VenueInputs } from './types'
import { isCountable } from './types'
import type { RoleKey } from './roleKeys'

/**
 * venue-sizing.md § UPS, § VA sizing by court count
 *
 * The UPS is specified by RATING, not by SKU. PH stocks one unit — the KSTAR
 * MP RT 3K S, 3000 VA / 2700 W — and will keep installing it, but that is a
 * purchasing fact, not a specification: it is the top of the ladder and every
 * venue under 16 courts needs far less. Naming it on the BOM tells whoever is
 * quoting nothing about what the venue actually requires.
 *
 * The source spreadsheet's own picker (`Cost Analysis!D4`) cannot be ported.
 * It is count-based rather than watt-based, and its "4+ courts" term tests the
 * empty cell `Z11`, so it always reads FALSE — meaning every multi-court Pro
 * venue lands on a 750 VA / 600 W unit, including a 14-court one drawing over
 * 600 W. This module reads the real load instead.
 *
 * The rack PDU is skipped — the UPS socket plate handles distribution — so the
 * UPS is the whole power line.
 */

/** The sizes actually stocked in PH. 1600 VA is a sourcing target, not a rung. */
export const UPS_LADDER = [750, 1000, 1500, 2000, 3000] as const

/**
 * Headroom for battery ageing, inrush and PoE conversion loss. The industry
 * bar is "never above 80%"; the doc takes 70%, which is the more conservative
 * end and leaves room for a venue to add a court without re-buying.
 */
const HEADROOM = 0.7

/**
 * The pessimistic end of line-interactive, and what to assume whenever a PH
 * listing quotes VA with no watt figure. Real units bear this out: the APC
 * SMC1500I is 1500 VA / 900 W — exactly 0.6 — while an SMT1500 is 0.67 and a
 * CyberPower OR2200PFCRT2U is 0.77. Assuming better than 0.6 would under-spec
 * against the cheapest unit a vendor might quote.
 */
const ASSUMED_PF = 0.6

/**
 * The ISP modem never appears as a purchased line — it is the provider's box —
 * but it is bolted in the rack and plugged into the UPS. ~10 W is an estimate;
 * the doc states no better figure and none is published for a unit that varies
 * per ISP.
 */
const ISP_MODEM_WATTS = 10

/**
 * `Cost Analysis!F24/F25` against `Lists!F44:G52`, keyed on security-camera
 * count. The NVR is NOT a BOM line — Autonomous+ adds it by hand — but it sits
 * in the rack drawing mains, and at 100-160 W it moves a venue a full band.
 * Sizing an Autonomous+ venue without it is the single largest way to get this
 * number wrong.
 */
const NVR_BANDS: ReadonlyArray<readonly [number, number]> = [
  [20, 100],   // 1x UNVR
  [35, 160],   // 1x UNVR-Pro
  [40, 200],   // 2x UNVR
  [60, 320],   // 2x UNVR-Pro
]

export interface UpsPlan {
  /** Total rack draw in watts — everything plugged into the UPS. */
  load: number
  /** What the unit's real-power rating must be, after headroom. */
  requiredWatts: number
  /** That requirement expressed as a VA rating at the assumed power factor. */
  requiredVa: number
  /** The stocked size to ask for. */
  rung: number
  /** The venue needs more than the ladder covers — a design decision. */
  overLadder: boolean
  /** More security cameras than the NVR band table covers, so load is low. */
  nvrUnbanded: boolean
  line: CalculatedLine
}

function nvrWatts(securityCameras: number): number {
  if (securityCameras < 1) return 0
  const band = NVR_BANDS.find(([max]) => securityCameras <= max)
  // Past the table there is no figure, so the top band is a floor, not an
  // answer — the caller raises a warning rather than letting it look derived.
  return band ? band[1] : NVR_BANDS[NVR_BANDS.length - 1][1]
}

/**
 * Summed from the lines the rest of the engine emitted, not re-derived from
 * inputs, so that anything added to the rack later is counted without touching
 * this module. Must therefore be called after every other line is pushed.
 *
 * Both wattage fields are added because a UPS carries both kinds of draw: the
 * gateway and switches take mains, and every PoE device reaches the UPS
 * *through* them. There is no double-count — `mainsWatts` on a switch excludes
 * the PoE it hands out, which is exactly what the PoE lines account for
 * separately. This is the opposite of checkPoeBudget, which counts only what
 * crosses the Ethernet and deliberately ignores the rack's own mains draw.
 */
export function planUps(
  inputs: VenueInputs,
  lines: CalculatedLine[],
  catalog: Item[],
): UpsPlan {
  const byRole = new Map(
    catalog.filter(i => i.roleKey).map(i => [i.roleKey as RoleKey, i]),
  )

  const gear = lines.reduce((sum, line) => {
    if (!isCountable(line.qty)) return sum
    const item = byRole.get(line.roleKey)
    const watts = (item?.poeWatts ?? 0) + (item?.mainsWatts ?? 0)
    return sum + watts * line.qty
  }, 0)

  const load = gear + ISP_MODEM_WATTS + nvrWatts(inputs.securityCameras)

  const requiredWatts = load / HEADROOM
  const requiredVa = requiredWatts / ASSUMED_PF
  const overLadder = requiredVa > UPS_LADDER[UPS_LADDER.length - 1]
  const rung = UPS_LADDER.find(va => va >= requiredVa)
    ?? UPS_LADDER[UPS_LADDER.length - 1]

  return {
    load,
    requiredWatts,
    requiredVa,
    rung,
    overLadder,
    nvrUnbanded: inputs.securityCameras > NVR_BANDS[NVR_BANDS.length - 1][0],
    line: {
      roleKey: `ups_${rung}va` as RoleKey,
      qty: 1,
      // The derivation is shown rather than just the answer: a bare VA figure
      // cannot be checked by the person holding the sheet, and this one rests
      // on two assumptions (70% headroom, PF 0.6) they may need to challenge.
      formula:
        `${Math.round(load)} W ÷ ${HEADROOM.toFixed(2)} ÷ PF ${ASSUMED_PF} ` +
        `= ${Math.round(requiredVa)} VA → ${rung} VA`,
    },
  }
}
