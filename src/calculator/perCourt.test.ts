import { describe, it, expect } from 'vitest'
import { planPerCourt } from './perCourt'
import type { VenueInputs, Qty } from './types'

const pro = (over: Partial<VenueInputs> = {}): VenueInputs => ({
  courts: 8, tier: 'pro', securityCameras: 0, kisiDoors: 0,
  extendedRetention: false, ...over,
})

const qty = (inputs: VenueInputs, role: string): Qty | undefined =>
  planPerCourt(inputs).find(l => l.roleKey === role)?.qty

describe('planPerCourt', () => {
  it('gives one of each court device per court', () => {
    const i = pro()
    for (const role of [
      'replay_camera', 'ipad', 'ipad_poe_adapter',
      'ipad_wall_mount', 'apple_tv', 'hdmi_cable', 'display',
    ]) {
      expect(qty(i, role)).toBe(8)
    }
  })

  it('gives 2 Flic per court plus 2 venue spares', () => {
    expect(qty(pro(), 'flic')).toBe(18)
  })

  it('gives 2 signs per court', () => {
    expect(qty(pro(), 'signage')).toBe(16)
  })

  it('gives exactly one Mac mini and one shelf regardless of court count', () => {
    expect(qty(pro({ courts: 14 }), 'mac_mini')).toBe(1)
    expect(qty(pro({ courts: 14 }), 'mac_mini_shelf')).toBe(1)
  })

  // Junction boxes are out of scope for Kosmas as of 2026-08-11. The camera
  // itself is still quantified; only its PFA130-E mount went away, along with
  // the deferred TBD line the source gave for the security one.
  it('emits security cameras as a count and no junction box of either kind', () => {
    const i = pro({ tier: 'autonomous_plus', securityCameras: 4, kisiDoors: 1 })
    expect(qty(i, 'security_camera')).toBe(4)
    expect(planPerCourt(i).some(l => l.roleKey.includes('junction'))).toBe(false)
  })

  it('omits security lines entirely when there are none', () => {
    expect(qty(pro(), 'security_camera')).toBeUndefined()
  })

  it('emits a TBD access point line, because silently outputting 0 is how they get forgotten', () => {
    expect(qty(pro(), 'access_point')).toBe('TBD')
  })

  // The source auto-sizes this only for Pickleball Kingdom and defers it for
  // everyone else. Kosmas builds no PBK venues, so it is always deferred —
  // deriving `= courts` from the wall-mount row beside it would put a
  // fabricated quantity on a printed BOM.
  it('always defers the fence bracket, since the source auto-sizes it for a brand we do not build', () => {
    expect(qty(pro(), 'ipad_fence_bracket')).toBe('TBD')
    expect(qty(pro({ courts: 14 }), 'ipad_fence_bracket')).toBe('TBD')
  })
})
