import { describe, it, expect } from 'vitest'
import { calculateBOM } from './index'
import { testCatalog } from './testCatalog'
import type { VenueInputs, Qty } from './types'

const pro = (courts: number, over: Partial<VenueInputs> = {}): VenueInputs => ({
  courts, tier: 'pro', securityCameras: 0, kisiDoors: 0,
  brand: 'podplay', extendedRetention: false, ...over,
})

const run = (inputs: VenueInputs) => {
  const r = calculateBOM(inputs, testCatalog)
  const qty = (role: string): Qty | undefined =>
    r.lines.find(l => l.roleKey === role)?.qty
  const codes = r.warnings.map(w => w.code)
  return { ...r, qty, codes }
}

// venue-sizing.md § Worked examples — these four are the doc's own reference
// outputs. A failure here means the transcription is wrong, not the test.
describe('worked example: 5-court Pro venue', () => {
  const r = run(pro(5))
  it('uses one Pro 24-port switch', () => expect(r.qty('switch_24_pro')).toBe(1))
  it('uses one 24-port patch panel', () => expect(r.qty('patch_panel_24')).toBe(1))
  it('needs 17 of the 0.5M cable (15 ports + 2)', () => expect(r.qty('cat6_0m5')).toBe(17))
  it('needs 2 of the 1M', () => expect(r.qty('cat6_1m')).toBe(2))
  it('needs 2 of the 3M', () => expect(r.qty('cat6_3m')).toBe(2))
  it('uses one UPS', () => expect(r.qty('ups')).toBe(1))
  it('uses 2 C14 adapters', () => expect(r.qty('c14_adapter')).toBe(2))
  it('uses a 12U rack, being well under 10U of gear', () => expect(r.qty('rack_12u')).toBe(1))
  it('uses the 2TB SSD', () => expect(r.qty('replay_ssd_2tb')).toBe(1))
  it('uses 5 iPad PoE adapters', () => expect(r.qty('ipad_poe_adapter')).toBe(5))
  it('uses 12 Flic buttons', () => expect(r.qty('flic')).toBe(12))
})

describe('worked example: 8-court Pro venue', () => {
  const r = run(pro(8))
  it('fits exactly one 24-port switch at 24 ports', () => expect(r.qty('switch_24_pro')).toBe(1))
  it('needs 26 of the 0.5M cable', () => expect(r.qty('cat6_0m5')).toBe(26))
  it('uses a 12U rack', () => expect(r.qty('rack_12u')).toBe(1))
  it('uses 8 iPad PoE adapters', () => expect(r.qty('ipad_poe_adapter')).toBe(8))
  it('uses 18 Flic buttons', () => expect(r.qty('flic')).toBe(18))
})

describe('worked example: 10-court Pro venue', () => {
  const r = run(pro(10))
  it('crosses to a 48-port switch at 30 ports', () => {
    expect(r.qty('switch_48_pro')).toBe(1)
    expect(r.qty('switch_24_pro')).toBeUndefined()
  })
  it('uses one 48-port patch panel', () => expect(r.qty('patch_panel_48')).toBe(1))
  it('needs 32 of the 0.5M cable', () => expect(r.qty('cat6_0m5')).toBe(32))
  it('uses 22 Flic buttons', () => expect(r.qty('flic')).toBe(22))
})

describe('worked example: 14-court Pro venue', () => {
  const r = run(pro(14))
  it('still fits a single 48-port switch at 42 ports', () => {
    expect(r.qty('switch_48_pro')).toBe(1)
  })
  it('needs 44 of the 0.5M cable', () => expect(r.qty('cat6_0m5')).toBe(44))
  it('still uses a 12U rack — rack U does not scale with courts', () => {
    expect(r.qty('rack_12u')).toBe(1)
  })
  it('uses 30 Flic buttons', () => expect(r.qty('flic')).toBe(30))
  it('reports PoE at 71%, the doc\'s figure for the densest standard config', () => {
    const poe = r.warnings.find(w => w.code === 'POE_BUDGET')
    expect(poe?.message).toContain('71%')
    expect(poe?.level).toBe('info')
  })
})

describe('gates short-circuit the whole calculation', () => {
  it('returns no lines for Basic tier', () => {
    const r = run(pro(8, { tier: 'basic' }))
    expect(r.lines).toHaveLength(0)
    expect(r.codes).toContain('TIER_NO_HARDWARE')
  })

  it('returns no lines for PingPod', () => {
    expect(run(pro(8, { brand: 'pingpod' })).lines).toHaveLength(0)
  })
})

describe('edge cases', () => {
  it('gives a 1-court venue a UDM-SE and NO switch', () => {
    const r = run(pro(1))
    expect(r.qty('gateway_udm_se')).toBe(1)
    expect(r.qty('switch_24_pro')).toBeUndefined()
    expect(r.qty('switch_24_std')).toBeUndefined()
    expect(r.qty('switch_48_pro')).toBeUndefined()
  })

  it('errors above the 264-port ceiling and returns no lines', () => {
    const r = run(pro(89))
    expect(r.lines).toHaveLength(0)
    expect(r.codes).toContain('PORT_CEILING')
  })

  it('accepts exactly 264 ports', () => {
    expect(run(pro(88)).codes).not.toContain('PORT_CEILING')
  })

  it('warns about the unmapped role when the catalog lacks an item', () => {
    const thin = testCatalog.filter(i => i.roleKey !== 'ups')
    const r = calculateBOM(pro(8), thin)
    expect(r.warnings.map(w => w.code)).toContain('UNMAPPED_ROLE')
  })

  it('always emits the access point warning', () => {
    expect(run(pro(8)).codes).toContain('ACCESS_POINTS_MANUAL')
  })
})
