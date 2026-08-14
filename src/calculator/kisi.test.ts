import { describe, it, expect } from 'vitest'
import { planKisi } from './kisi'
import type { VenueInputs } from './types'

const base: VenueInputs = {
  courts: 8,
  tier: 'autonomous',
  securityCameras: 0,
  kisiDoors: 0,
  extendedRetention: false,
  backupInternet: false,
}

const at = (kisiDoors: number, backupInternet = false) =>
  planKisi({ ...base, kisiDoors, backupInternet })

describe('planKisi — controller count', () => {
  // `Cost Analysis!F37` reads `IF(AND(Z14>=1, Z16<=4), 1, ...)` — Z16, not
  // Z14. Z16 is empty, so `0<=4` is TRUE for every venue and the first band
  // always wins: the sheet emits exactly 1 controller no matter the door
  // count, and bands 2-8 are unreachable. The doc says to implement the
  // intent and flag the divergence, never to reproduce the typo.
  it('scales 1 per 4 doors rather than the sheet\'s constant 1', () => {
    expect(at(1).controllers).toBe(1)
    expect(at(4).controllers).toBe(1)
    expect(at(5).controllers).toBe(2)
    expect(at(8).controllers).toBe(2)
    expect(at(12).controllers).toBe(3)
  })

  // The sheet's last real band returns 7 for 29-32 doors — an off-by-one
  // independent of the Z16 defect — and the string "N/A" above 32. Neither is
  // reproduced: the rule is arithmetic, so it just keeps going.
  it('keeps scaling past the bands where the sheet breaks', () => {
    expect(at(32).controllers).toBe(8)
    expect(at(33).controllers).toBe(9)
  })

  it('sizes one reader per door', () => {
    expect(at(6).readers).toBe(6)
  })
})

describe('planKisi — where the readers land', () => {
  // Free UDM ports = 8 - 1 (Mac mini) - controllers - backup WAN. The
  // UDM-to-switch uplink is an SFP DAC and consumes no RJ45, which is why it
  // never appears here. One controller and no backup WAN leaves the doc's
  // "normally 6".
  it('leaves 6 free UDM ports on the standard 1-4 door build', () => {
    expect(at(4).freeUdmPorts).toBe(6)
  })

  it('puts readers on the UDM-SE first, as Kosmas policy requires', () => {
    const plan = at(4)
    expect(plan.readersOnUdm).toBe(4)
    expect(plan.readersOnSwitch).toBe(0)
  })

  // A second controller eats a UDM port, so 6 doors do not all fit even
  // though 6 ports were free at 4 doors — the controller count grows first.
  it('overflows to the switch once the UDM-SE runs out', () => {
    const plan = at(6)
    expect(plan.controllers).toBe(2)
    expect(plan.freeUdmPorts).toBe(5)
    expect(plan.readersOnUdm).toBe(5)
    expect(plan.readersOnSwitch).toBe(1)
  })

  // The doc calls out backup WAN as one of the things that eats into the
  // margin, taking the safe door count from "> 4" down toward "> 5-6".
  it('gives up a UDM port to a backup WAN, pushing a reader to the switch', () => {
    expect(at(5).readersOnSwitch).toBe(0)
    expect(at(5, true).readersOnSwitch).toBe(1)
  })

  it('never reports negative free ports when controllers exhaust the UDM', () => {
    const plan = at(40)
    expect(plan.freeUdmPorts).toBe(0)
    expect(plan.readersOnSwitch).toBe(40)
  })

  it('is inert on a venue with no doors', () => {
    const plan = at(0)
    expect(plan.controllers).toBe(0)
    expect(plan.readers).toBe(0)
    expect(plan.readersOnSwitch).toBe(0)
  })
})
