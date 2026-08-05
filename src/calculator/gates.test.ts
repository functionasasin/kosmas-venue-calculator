import { describe, it, expect } from 'vitest'
import { evaluateGates } from './gates'
import type { VenueInputs } from './types'

const base: VenueInputs = {
  courts: 8, tier: 'pro', securityCameras: 0,
  kisiDoors: 0, brand: 'podplay', extendedRetention: false,
}

describe('evaluateGates', () => {
  it('lets a normal Pro venue through', () => {
    const r = evaluateGates(base)
    expect(r.blocked).toBe(false)
    expect(r.warnings).toHaveLength(0)
  })

  it('blocks Basic tier, because it has no rack kit at all and a full BOM would be a lie', () => {
    const r = evaluateGates({ ...base, tier: 'basic' })
    expect(r.blocked).toBe(true)
    expect(r.warnings[0].code).toBe('TIER_NO_HARDWARE')
  })

  it('blocks Basic+ for the same reason', () => {
    expect(evaluateGates({ ...base, tier: 'basic_plus' }).blocked).toBe(true)
  })

  it('blocks PingPod, because its audio stack and port expansion are unimplemented', () => {
    const r = evaluateGates({ ...base, brand: 'pingpod' })
    expect(r.blocked).toBe(true)
    expect(r.warnings[0].code).toBe('BRAND_UNSUPPORTED')
  })

  it('blocks security cameras on Pro tier, because they silently upgrade the switch SKU', () => {
    const r = evaluateGates({ ...base, securityCameras: 4 })
    expect(r.blocked).toBe(true)
    expect(r.warnings[0].code).toBe('INPUT_INCONSISTENT')
  })

  it('allows security cameras on Autonomous+', () => {
    expect(evaluateGates({
      ...base, tier: 'autonomous_plus', securityCameras: 4, kisiDoors: 2,
    }).blocked).toBe(false)
  })

  it('blocks Kisi doors on Pro tier', () => {
    expect(evaluateGates({ ...base, kisiDoors: 2 }).blocked).toBe(true)
  })

  it('warns without blocking on Pro+, because its BOM is not canonicalized', () => {
    const r = evaluateGates({ ...base, tier: 'pro_plus' })
    expect(r.blocked).toBe(false)
    expect(r.warnings.map(w => w.code)).toContain('TIER_NOT_CANONICAL')
  })

  it('warns without blocking on Autonomous+, because NVR and HDD rack U are excluded', () => {
    const r = evaluateGates({
      ...base, tier: 'autonomous_plus', securityCameras: 4, kisiDoors: 2,
    })
    expect(r.blocked).toBe(false)
    expect(r.warnings.map(w => w.code)).toContain('TIER_RACK_UNDERSIZED')
  })

  it('rejects zero courts', () => {
    expect(evaluateGates({ ...base, courts: 0 }).blocked).toBe(true)
  })

  it('rejects an Autonomous venue with no Kisi doors, which would pick the wrong gateway', () => {
    const r = evaluateGates({ ...base, tier: 'autonomous', kisiDoors: 0 })
    expect(r.blocked).toBe(true)
    expect(r.warnings[0].code).toBe('INPUT_INCONSISTENT')
  })
})
