import { describe, it, expect } from 'vitest'
import { planSsd } from './storage'
import { calculateBOM } from './index'
import { testCatalog } from './testCatalog'
import type { VenueInputs } from './types'

const pro = (courts: number, extendedRetention = false): VenueInputs => ({
  courts, tier: 'pro', securityCameras: 0, kisiDoors: 0,
  extendedRetention, backupInternet: false,
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

// planPower() was replaced by planUps() on 2026-08-20 — the UPS is specified by
// VA rating now, not as a fixed KSTAR line, so quantity and rung are covered in
// power.test.ts where the load arithmetic lives. What does NOT belong there is
// the absence check below: the C14-to-Universal adapters went out of scope on
// 2026-08-11, and asserting that power is a single line keeps a reinstated pair
// from arriving silently on a printed BOM.
describe('the power section is the UPS alone', () => {
  it('emits no line beside the UPS', () => {
    const power = calculateBOM(pro(8), testCatalog).lines
      .filter(l => l.roleKey.startsWith('ups_'))
    expect(power).toHaveLength(1)
    expect(power[0].qty).toBe(1)
  })
})
