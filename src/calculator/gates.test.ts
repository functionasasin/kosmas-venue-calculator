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

  // Pro permits cameras since it absorbed Pro+, whose court-side list had
  // "optional security cameras". planSwitches reads securityCameras directly,
  // so the upgraded switch SKU it produces is correct for a venue that has them.
  it('allows security cameras on Pro, because Pro+ permitted them and Pro absorbed Pro+', () => {
    expect(evaluateGates({ ...base, securityCameras: 4 }).blocked).toBe(false)
  })

  // The one camera gate that survives the merge, and the load-bearing one:
  // Autonomous is access control WITHOUT surveillance. This is the whole
  // Autonomous / Autonomous+ boundary, and it has been collapsed before.
  it('still blocks security cameras on Autonomous, because that tier has no surveillance at all', () => {
    const r = evaluateGates({ ...base, tier: 'autonomous', kisiDoors: 2, securityCameras: 4 })
    expect(r.blocked).toBe(true)
    expect(r.warnings[0].code).toBe('INPUT_INCONSISTENT')
  })

  it('allows security cameras on Autonomous+', () => {
    expect(evaluateGates({
      ...base, tier: 'autonomous_plus', securityCameras: 4, kisiDoors: 2,
    }).blocked).toBe(false)
  })

  // Pro absorbed Pro+ on 2026-08-10, so doors on Pro are now the supported way
  // to spec the old Pro+ deal rather than an inconsistency. The BOM was always
  // input-driven — pickGateway reads kisiDoors, never the tier — so a door
  // count here yields the UDM-SE it always would have.
  it('allows Kisi doors on Pro and warns instead of blocking, because Pro absorbed Pro+', () => {
    const r = evaluateGates({ ...base, kisiDoors: 2 })
    expect(r.blocked).toBe(false)
    expect(r.warnings.map(w => w.code)).toContain('TIER_NOT_CANONICAL')
  })

  // The caveat belongs to having custom access/monitoring, not to a tier label.
  // Scoped to the tier it fired on a Pro+ venue with nothing bolted on, and
  // stayed silent on a Pro deal that had doors but was never relabelled.
  it('leaves an ordinary Pro venue with no caveats at all, so the warning still means something', () => {
    const r = evaluateGates(base)
    expect(r.warnings.map(w => w.code)).not.toContain('TIER_NOT_CANONICAL')
    expect(r.warnings.map(w => w.code)).not.toContain('TIER_LEAD_TIME')
  })

  // Lead time is a property of the imported hardware, not of the label. A Pro
  // venue with cameras is buying exactly the stock that ships from US/HK.
  it('warns about lead time whenever imported hardware is specced, tier notwithstanding', () => {
    expect(evaluateGates({ ...base, securityCameras: 3 }).warnings.map(w => w.code))
      .toContain('TIER_LEAD_TIME')
    expect(evaluateGates({ ...base, tier: 'autonomous', kisiDoors: 1 }).warnings.map(w => w.code))
      .toContain('TIER_LEAD_TIME')
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
