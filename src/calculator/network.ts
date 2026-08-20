import type { VenueInputs } from './types'
import type { RoleKey } from './roleKeys'
import { planKisi } from './kisi'

/**
 * venue-sizing.md § Sizing inputs (glossary), § Kisi port accounting
 * 3 ports per court (replay camera + iPad + Apple TV), plus security cameras,
 * plus any Kisi readers that did not fit on the UDM-SE.
 *
 * That last term is the one `Cost Analysis!F7` is missing entirely — it bands
 * switch quantity with no Kisi term at all, so an Autonomous venue's door
 * hardware never reaches switch sizing. Counting it here is what lets the tool
 * say when the 24-port build stops working instead of silently overflowing it.
 */
export function totalPorts(inputs: VenueInputs): number {
  return (
    3 * inputs.courts +
    inputs.securityCameras +
    planKisi(inputs).readersOnSwitch
  )
}

/**
 * venue-sizing.md § Firewall / gateway SKU
 * UDM-SE when Kisi doors exist, or for a single-court venue (which has no
 * switch, so the gateway's own PoE powers the court gear). UDM-Pro otherwise.
 */
export function pickGateway(inputs: VenueInputs): RoleKey {
  return inputs.kisiDoors > 0 || inputs.courts === 1
    ? 'gateway_udm_se'
    : 'gateway_udm_pro'
}

export interface SwitchPlan {
  count24: number
  count48: number
  /** Which 24-port SKU. Drives the PoE budget — the two are far apart. */
  roleKey24: 'switch_24_pro' | 'switch_24_std'
  overCapacity: boolean
}

// venue-sizing.md § Quantity table — Lists rows 17-27. Upper bound of each
// band, then the 24-port and 48-port counts.
const BANDS: ReadonlyArray<readonly [number, number, number]> = [
  [24, 1, 0], [48, 0, 1], [72, 1, 1], [96, 0, 2], [120, 1, 2],
  [144, 0, 3], [168, 1, 3], [192, 0, 4], [216, 1, 4], [240, 0, 5],
  [264, 1, 5],
]

/**
 * venue-sizing.md § Switch SKU + sizing
 * A single-court venue gets no switch at all — the doc is explicit that
 * switch quantity is zero and the gateway powers the court directly.
 */
export function planSwitches(inputs: VenueInputs, ports: number): SwitchPlan {
  // `Cost Analysis!D7`. In practice this only ever picks the non-Pro switch for
  // a 2-3 court Pro venue: the gates block Basic and Basic+ outright and reject
  // an Autonomous tier with fewer than one door, so every other tier trips one
  // of the first two terms on its own, and a 1-court venue gets no switch.
  const wantPro =
    inputs.securityCameras > 0 || inputs.kisiDoors > 0 || inputs.courts >= 4
  const roleKey24 = wantPro ? 'switch_24_pro' : 'switch_24_std'

  if (inputs.courts === 1) {
    return { count24: 0, count48: 0, roleKey24, overCapacity: false }
  }

  const band = BANDS.find(([max]) => ports <= max)
  if (!band) {
    return { count24: 0, count48: 0, roleKey24, overCapacity: true }
  }

  return { count24: band[1], count48: band[2], roleKey24, overCapacity: false }
}
