import { describe, it, expect } from 'vitest'
import {
  evaluateGates, allowsSecurityCameras, allowsKisiDoors, type GateResult,
} from './gates'
import type { VenueInputs, Tier } from './types'

const base: VenueInputs = {
  courts: 8, tier: 'pro', securityCameras: 0,
  kisiDoors: 0, extendedRetention: false, backupInternet: false,
}

const warningText = (r: GateResult, code: string) =>
  r.warnings.find(w => w.code === code)?.message ?? ''

describe('evaluateGates', () => {
  it('lets a normal Pro venue through', () => {
    const r = evaluateGates(base)
    expect(r.blocked).toBe(false)
    expect(r.warnings).toHaveLength(0)
  })

  it('blocks Basic+, because the tier is software only and a rack BOM would be a lie', () => {
    const r = evaluateGates({ ...base, tier: 'basic_plus' })
    expect(r.blocked).toBe(true)
    expect(r.warnings[0].code).toBe('TIER_NO_HARDWARE')
  })

  // Corrected 2026-08-14: NEITHER tier has hardware, so neither message may
  // name any. Basic+ was recorded as carrying BBPOS payment terminals, and this
  // test previously asserted its message said so. That line was never sourced —
  // the original tiers doc put terminals on both lowest tiers, and when Basic
  // was edited down to "no hardware at all" the terminals stayed behind on
  // Basic+, inventing a tier boundary instead of recording one. Naming hardware
  // on a tier that has none tells a buyer to order something that doesn't exist.
  it('attributes no hardware to either blocked tier', () => {
    for (const tier of ['basic', 'basic_plus'] as const) {
      const r = evaluateGates({ ...base, tier })
      expect(r.blocked).toBe(true)
      expect(r.warnings[0].code).toBe('TIER_NO_HARDWARE')
      expect(warningText(r, 'TIER_NO_HARDWARE')).not.toMatch(/BBPOS|terminal/i)
      expect(warningText(r, 'TIER_NO_HARDWARE')).toMatch(/no hardware at all/)
    }
  })

  // Corrected 2026-08-13: what Basic+ adds is the venue's OWN booking app on
  // iOS and Android — a Tela Park deal gets a Tela Park app. It is not an
  // owner/admin tool, which is how this message read until now; owners already
  // have the admin dashboard at Basic. Since the app is the entire difference
  // between the two blocked tiers, describing it wrongly misstates the only
  // thing the message exists to convey.
  it('makes the mobile app the stated difference between Basic and Basic+', () => {
    expect(warningText(evaluateGates({ ...base, tier: 'basic_plus' }), 'TIER_NO_HARDWARE'))
      .toMatch(/iOS and Android/)
    expect(warningText(evaluateGates({ ...base, tier: 'basic' }), 'TIER_NO_HARDWARE'))
      .toMatch(/no app/i)
  })

  // Pro is Door Access "No" and Remote Monitoring "No" in the capabilities
  // matrix. These two gates are not validation bookkeeping — no sizing module
  // reads `tier`, so they are the only thing keeping a Pro venue off hardware
  // Pro does not include. Deleting them on 2026-08-10 let a Pro venue take
  // doors and cameras; both were restored the same day.
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

  it('allows security cameras on Autonomous+', () => {
    expect(evaluateGates({
      ...base, tier: 'autonomous_plus', securityCameras: 4, kisiDoors: 2,
    }).blocked).toBe(false)
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

// The form disables the camera and door inputs per tier. It must not carry its
// own copy of these rules: a second list is how the picker and the gate drift
// apart, which is how a venue ends up offered an input the calculation then
// rejects. These predicates are the one definition, exported for the form.
describe('input permissions', () => {
  const ALL: Tier[] = ['basic', 'basic_plus', 'pro', 'autonomous', 'autonomous_plus']

  it('permits security cameras on Autonomous+ alone', () => {
    expect(ALL.filter(allowsSecurityCameras)).toEqual(['autonomous_plus'])
  })

  it('permits Kisi doors on the two Autonomous tiers', () => {
    expect(ALL.filter(allowsKisiDoors)).toEqual(['autonomous', 'autonomous_plus'])
  })

  // Behavioural agreement, not just matching lists: whatever the predicate says
  // is allowed must be what evaluateGates actually accepts. Restricted to the
  // tiers that reach these gates — Basic and Basic+ are stopped earlier by
  // TIER_NO_HARDWARE, so a camera count never gets that far.
  const REACHES_GATE: Tier[] = ['pro', 'autonomous', 'autonomous_plus']
  const rejects = (i: Partial<VenueInputs>) =>
    evaluateGates({ ...base, ...i }).warnings.some(w => w.code === 'INPUT_INCONSISTENT')

  it('enables exactly the inputs the gates go on to accept', () => {
    for (const tier of REACHES_GATE) {
      const doors = tier === 'pro' ? 0 : 1
      expect(allowsSecurityCameras(tier))
        .toBe(!rejects({ tier, securityCameras: 1, kisiDoors: doors }))
      expect(allowsKisiDoors(tier))
        .toBe(!rejects({ tier, securityCameras: 0, kisiDoors: 1 }))
    }
  })
})
