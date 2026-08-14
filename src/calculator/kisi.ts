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
const UDM_RJ45_PORTS = 8
const MAC_MINI_PORTS = 1

// tiers-reference.md § Autonomous Kisi kit — one controller drives four doors.
const DOORS_PER_CONTROLLER = 4

export interface KisiPlan {
  /** Rack-side, on the UDM. Non-PoE. */
  controllers: number
  /** One per door, 7W / 802.3af. */
  readers: number
  /** UDM RJ45 ports left after the Mac mini, controllers and any backup WAN. */
  freeUdmPorts: number
  readersOnUdm: number
  /** The term `Cost Analysis!F7` is missing. Feeds switch sizing. */
  readersOnSwitch: number
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

  const freeUdmPorts = Math.max(
    0,
    UDM_RJ45_PORTS - MAC_MINI_PORTS - controllers -
      (inputs.backupInternet ? 1 : 0),
  )

  const readersOnUdm = Math.min(readers, freeUdmPorts)

  return {
    controllers,
    readers,
    freeUdmPorts,
    readersOnUdm,
    readersOnSwitch: readers - readersOnUdm,
  }
}
