import type { VenueInputs } from './types'

/**
 * venue-sizing.md § Kisi port accounting (Autonomous / Autonomous+)
 * tiers-reference.md § Which rack port each Kisi device lands on
 *
 * The spreadsheet cannot see access control at all. `Cost Analysis!F7` bands
 * switch quantity on replay cameras + iPads + Apple TVs + security cameras
 * with no Kisi term, so readers and controllers are invisible to switch sizing
 * at every court count — the sheet will happily emit "1x USW-Pro-24-POE, 1
 * patch panel" for an 8-court Autonomous venue whose real demand exceeds 24.
 * Two further defects keep the shortfall from surfacing: `P38` reports the
 * controller count where the reader count belongs, and `Z26` pools the
 * gateway's 8 RJ45 ports into "ports available". This module is the honest
 * count the sheet does not do.
 */

// The UDM has 8 RJ45 ports. The Mac mini takes one on every venue. The
// UDM-to-switch uplink is an SFP DAC, so it consumes no RJ45 on either device
// and never appears in this arithmetic.
export const UDM_RJ45_PORTS = 8
const MAC_MINI_PORTS = 1

// tiers-reference.md § Autonomous Kisi kit — one controller drives four doors.
const DOORS_PER_CONTROLLER = 4

// Each court is an iPad, a replay camera and an Apple TV.
const PORTS_PER_COURT = 3

/**
 * `Cost Analysis!F7` is `IF(Z12=1, 0, <bands>)`, so a single-court venue has
 * no switch and its court gear hangs off the gateway beside the Mac mini.
 * Everywhere else that gear is on the switch and this is zero — the doc's
 * "normally 6 free ports" is written for the switched case and is three ports
 * too generous applied here. venue-sizing.md § Firewall / gateway SKU.
 */
function courtLoadOnGateway(inputs: VenueInputs): number {
  return inputs.courts === 1
    ? PORTS_PER_COURT * inputs.courts + inputs.securityCameras
    : 0
}

/**
 * Every RJ45 the gateway would have to hold if nothing overflowed: the Mac
 * mini, the court gear it carries on a switchless venue, the controllers,
 * every reader and any backup WAN.
 *
 * Deliberately counts READERS, not readersOnUdm — the point is to say how far
 * past the gateway's 8 ports the venue reaches, and capping it at what fits
 * would report exactly 8 forever. On a switched venue the overflow is the
 * switch's business, so only a single-court venue can be over.
 */
export function gatewayPortDemand(inputs: VenueInputs): number {
  return MAC_MINI_PORTS + courtLoadOnGateway(inputs)
    + Math.ceil(inputs.kisiDoors / DOORS_PER_CONTROLLER) + inputs.kisiDoors
    + (inputs.backupInternet ? 1 : 0)
}

export interface KisiPlan {
  /** Rack-side, on the UDM. Non-PoE. */
  controllers: number
  /** One per door, 7W / 802.3af. */
  readers: number
  /**
   * UDM RJ45 ports left after the Mac mini, controllers, any backup WAN and —
   * on a single-court venue only — the court gear, which has no switch to sit
   * on. venue-sizing.md § Firewall / gateway SKU.
   */
  freeUdmPorts: number
  readersOnUdm: number
  /** The term `Cost Analysis!F7` is missing. Feeds switch sizing. */
  readersOnSwitch: number
  /**
   * Readers with nowhere to go: the gateway is full and there is no switch.
   * Only ever non-zero on a single-court venue, and only past the 2-3 doors
   * one actually holds — the tool reports it rather than inventing a switch
   * to absorb it, because the smallest switch it can size is a 24-port and
   * buying one to land a single reader is a worse answer than saying so.
   */
  readersUnplaced: number
}

/**
 * Controllers are sized to the doc's *intent* — 1 per 4 doors — not to the
 * sheet's `F37`, which tests the empty cell `Z16` instead of `Z14` and so
 * returns 1 for every venue with any doors. The defect is latent in PH, where
 * venues run 1-4 doors and intent and bug agree, but it is a bug either way.
 *
 * Readers take UDM-SE PoE ports first and overflow to the switch. That is a
 * deliberate Kosmas deviation from PodPlay's port-labeling convention, which
 * puts every reader on the switch — see the warning raised in index.ts.
 */
export function planKisi(inputs: VenueInputs): KisiPlan {
  const readers = inputs.kisiDoors
  const controllers = Math.ceil(readers / DOORS_PER_CONTROLLER)

  const unswitched = inputs.courts === 1
  const courtLoad = courtLoadOnGateway(inputs)

  const freeUdmPorts = Math.max(
    0,
    UDM_RJ45_PORTS - MAC_MINI_PORTS - courtLoad - controllers -
      (inputs.backupInternet ? 1 : 0),
  )

  const readersOnUdm = Math.min(readers, freeUdmPorts)
  const overflow = readers - readersOnUdm

  return {
    controllers,
    readers,
    freeUdmPorts,
    readersOnUdm,
    // The overflow is one number but two different facts, and which one it is
    // decides whether totalPorts may count it. On a switched venue it is
    // demand the switch must carry; at one court there is no switch, and
    // adding it to the port total would size cable and bands for a device the
    // venue does not have.
    readersOnSwitch: unswitched ? 0 : overflow,
    readersUnplaced: unswitched ? overflow : 0,
  }
}
