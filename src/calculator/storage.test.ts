import { describe, it, expect } from 'vitest'
import { planSsd } from './storage'
import { planPower } from './power'
import type { VenueInputs } from './types'

const pro = (courts: number, extendedRetention = false): VenueInputs => ({
  courts, tier: 'pro', securityCameras: 0, kisiDoors: 0,
  brand: 'podplay', extendedRetention,
})

describe('planSsd', () => {
  it('gives 1TB up to 4 courts', () => {
    expect(planSsd(pro(4)).line.roleKey).toBe('replay_ssd_1tb')
  })

  it('steps up to 2TB at 5 courts', () => {
    expect(planSsd(pro(5)).line.roleKey).toBe('replay_ssd_2tb')
  })

  it('stays 2TB at 19 courts', () => {
    expect(planSsd(pro(19)).line.roleKey).toBe('replay_ssd_2tb')
  })

  it('steps up to 4TB at 20 courts', () => {
    const r = planSsd(pro(20))
    expect(r.line.roleKey).toBe('replay_ssd_4tb')
    expect(r.needsLargeSku).toBe(true)
  })

  it('forces 4TB when extended retention is wanted, at any court count', () => {
    expect(planSsd(pro(8, true)).line.roleKey).toBe('replay_ssd_4tb')
  })

  it('always specifies exactly one drive', () => {
    expect(planSsd(pro(8)).line.qty).toBe(1)
  })
})

describe('planPower', () => {
  it('gives one UPS — PH ships the KSTAR regardless of venue size', () => {
    const ups = planPower().find(l => l.roleKey === 'ups')
    expect(ups?.qty).toBe(1)
  })

  it('gives 2 C14 adapters, for the Mac mini and the ISP modem', () => {
    const c14 = planPower().find(l => l.roleKey === 'c14_adapter')
    expect(c14?.qty).toBe(2)
  })
})
