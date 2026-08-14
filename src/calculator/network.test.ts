import { describe, it, expect } from 'vitest'
import { totalPorts, pickGateway, planSwitches } from './network'
import type { VenueInputs } from './types'

const pro = (courts: number, over: Partial<VenueInputs> = {}): VenueInputs => ({
  courts, tier: 'pro', securityCameras: 0, kisiDoors: 0,
  extendedRetention: false, backupInternet: false, ...over,
})

describe('totalPorts', () => {
  // Readers that fit on the UDM-SE are not switch ports, so they must not
  // inflate this count; the ones that overflow are, and `Cost Analysis!F7`
  // counts neither. 8 courts + 6 doors leaves exactly one reader on the switch.
  it('adds only the readers the UDM-SE could not take', () => {
    const autonomous = { tier: 'autonomous' as const }
    expect(totalPorts(pro(8, { ...autonomous, kisiDoors: 4 }))).toBe(24)
    expect(totalPorts(pro(8, { ...autonomous, kisiDoors: 6 }))).toBe(25)
  })

  it('counts 3 ports per court — camera, iPad, Apple TV', () => {
    expect(totalPorts(pro(8))).toBe(24)
  })

  it('adds security cameras, which occupy their own ports', () => {
    expect(totalPorts({
      ...pro(7), tier: 'autonomous_plus', securityCameras: 7, kisiDoors: 1,
    })).toBe(28)
  })
})

describe('pickGateway', () => {
  it('picks UDM-Pro for multi-court Pro, because nothing PoE sits on the gateway', () => {
    expect(pickGateway(pro(8))).toBe('gateway_udm_pro')
  })

  it('picks UDM-SE for a single court, whose gear is powered by the gateway itself', () => {
    expect(pickGateway(pro(1))).toBe('gateway_udm_se')
  })

  it('picks UDM-SE when Kisi doors exist', () => {
    expect(pickGateway({ ...pro(8), tier: 'autonomous', kisiDoors: 2 }))
      .toBe('gateway_udm_se')
  })
})

describe('planSwitches', () => {
  it('emits NO switch for a 1-court venue, whose gear hangs off the gateway PoE', () => {
    const p = planSwitches(pro(1), 3)
    expect(p.count24).toBe(0)
    expect(p.count48).toBe(0)
  })

  it('uses one 24-port at exactly 24 ports', () => {
    const p = planSwitches(pro(8), 24)
    expect(p).toMatchObject({ count24: 1, count48: 0, overCapacity: false })
  })

  it('switches to a single 48-port at 25 ports', () => {
    expect(planSwitches(pro(9), 27)).toMatchObject({ count24: 0, count48: 1 })
  })

  it('still uses one 48-port at exactly 48 ports', () => {
    expect(planSwitches(pro(16), 48)).toMatchObject({ count24: 0, count48: 1 })
  })

  it('adds a 24-port at 49 ports, the next band boundary', () => {
    expect(planSwitches(pro(17), 49)).toMatchObject({ count24: 1, count48: 1 })
  })

  it('mixes 24 and 48 in the 49-72 band', () => {
    expect(planSwitches(pro(17), 51)).toMatchObject({ count24: 1, count48: 1 })
  })

  it('still mixes at exactly 72 ports', () => {
    expect(planSwitches(pro(24), 72)).toMatchObject({ count24: 1, count48: 1 })
  })

  it('drops to two 48-ports at 73, where the mixed pair no longer fits', () => {
    expect(planSwitches(pro(25), 73)).toMatchObject({ count24: 0, count48: 2 })
  })

  it('uses two 48-ports in the 73-96 band', () => {
    expect(planSwitches(pro(25), 75)).toMatchObject({ count24: 0, count48: 2 })
  })

  it('fills the top band at 264 ports', () => {
    expect(planSwitches(pro(88), 264)).toMatchObject({ count24: 1, count48: 5 })
  })

  it('flags over-capacity above 264 ports, the doc ceiling', () => {
    expect(planSwitches(pro(89), 265).overCapacity).toBe(true)
  })

  it('picks the Pro 24-port at 4+ courts', () => {
    expect(planSwitches(pro(8), 24).roleKey24).toBe('switch_24_pro')
  })

  it('picks the non-Pro 24-port below 4 courts with no cameras or doors', () => {
    expect(planSwitches(pro(3), 9).roleKey24).toBe('switch_24_std')
  })

  it('picks Pro when Kisi doors exist even below 4 courts', () => {
    expect(planSwitches(
      { ...pro(2), tier: 'autonomous', kisiDoors: 1 }, 6,
    ).roleKey24).toBe('switch_24_pro')
  })
})
