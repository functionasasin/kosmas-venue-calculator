import { describe, it, expect } from 'vitest'
import { evaluateGates, type GateResult } from './gates'
import type { VenueInputs } from './types'

const base: VenueInputs = {
  courts: 8, tier: 'pro', securityCameras: 0,
  kisiDoors: 0, brand: 'podplay', extendedRetention: false,
}

const warningText = (r: GateResult, code: string) =>
  r.warnings.find(w => w.code === code)?.message ?? ''

describe('evaluateGates', () => {
  it('lets a normal Pro venue through', () => {
    const r = evaluateGates(base)
    expect(r.blocked).toBe(false)
    expect(r.warnings).toHaveLength(0)
  })

  it('blocks Basic+, because BBPOS terminals are the whole footprint and a rack BOM would be a lie', () => {
    const r = evaluateGates({ ...base, tier: 'basic_plus' })
    expect(r.blocked).toBe(true)
    expect(r.warnings[0].code).toBe('TIER_NO_HARDWARE')
  })

  it('blocks PingPod, because its audio stack and port expansion are unimplemented', () => {
    const r = evaluateGates({ ...base, brand: 'pingpod' })
    expect(r.blocked).toBe(true)
    expect(r.warnings[0].code).toBe('BRAND_UNSUPPORTED')
  })

  // Pro is Door Access "No" and Remote Monitoring "No" in the capabilities
  // matrix. These two gates are not validation bookkeeping — they ARE what
  // distinguishes Pro from Pro+. Folding the tiers together on 2026-08-10
  // deleted them and made a Pro venue accepting doors and cameras, i.e. a Pro+
  // venue wearing the wrong name. Both gates were restored the same day.
  it('blocks security cameras on Pro tier, because they silently upgrade the switch SKU', () => {
    const r = evaluateGates({ ...base, securityCameras: 4 })
    expect(r.blocked).toBe(true)
    expect(r.warnings[0].code).toBe('INPUT_INCONSISTENT')
  })

  it('blocks Kisi doors on Pro tier, because Pro has no door access by definition', () => {
    expect(evaluateGates({ ...base, kisiDoors: 2 }).blocked).toBe(true)
  })

  // Autonomous is access control WITHOUT surveillance — the whole
  // Autonomous / Autonomous+ boundary, which has been collapsed before.
  it('blocks security cameras on Autonomous, because that tier has no surveillance at all', () => {
    const r = evaluateGates({ ...base, tier: 'autonomous', kisiDoors: 2, securityCameras: 4 })
    expect(r.blocked).toBe(true)
    expect(r.warnings[0].code).toBe('INPUT_INCONSISTENT')
  })

  it('allows both on Pro+, which is the tier that exists to carry them', () => {
    expect(evaluateGates({ ...base, tier: 'pro_plus', kisiDoors: 2, securityCameras: 4 }).blocked)
      .toBe(false)
  })

  it('allows security cameras on Autonomous+', () => {
    expect(evaluateGates({
      ...base, tier: 'autonomous_plus', securityCameras: 4, kisiDoors: 2,
    }).blocked).toBe(false)
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
    // Autonomous+ is the tier that actually has an NVR, so naming it is correct here.
    expect(warningText(r, 'TIER_RACK_UNDERSIZED')).toMatch(/NVR/)
  })

  // Autonomous has Kisi access control and NO surveillance — no cameras, no NVR.
  // Collapsing the two tiers tells a buyer to leave rack U for hardware the tier
  // never includes, which is a wrong answer rather than a conservative one.
  it('warns on Autonomous about the Kisi controller only, never an NVR it does not have', () => {
    const r = evaluateGates({ ...base, tier: 'autonomous', kisiDoors: 2 })
    expect(r.blocked).toBe(false)
    expect(r.warnings.map(w => w.code)).toContain('TIER_RACK_UNDERSIZED')
    expect(warningText(r, 'TIER_RACK_UNDERSIZED')).toMatch(/Kisi/)
    expect(warningText(r, 'TIER_RACK_UNDERSIZED')).not.toMatch(/NVR|HDD/)
    expect(warningText(r, 'TIER_ADDITIONS_MANUAL')).not.toMatch(/NVR|HDD/)
  })

  it('flags non-Pro tiers for procurement lead time, because PH does not stock them', () => {
    const r = evaluateGates({ ...base, tier: 'autonomous', kisiDoors: 2 })
    expect(r.warnings.map(w => w.code)).toContain('TIER_LEAD_TIME')
    expect(evaluateGates(base).warnings.map(w => w.code))
      .not.toContain('TIER_LEAD_TIME')
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
