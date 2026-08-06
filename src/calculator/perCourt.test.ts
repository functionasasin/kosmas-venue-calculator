import { describe, it, expect } from 'vitest'
import { planPerCourt } from './perCourt'
import type { VenueInputs, Qty } from './types'

const pro = (over: Partial<VenueInputs> = {}): VenueInputs => ({
  courts: 8, tier: 'pro', securityCameras: 0, kisiDoors: 0,
  brand: 'podplay', extendedRetention: false, ...over,
})

const qty = (inputs: VenueInputs, role: string): Qty | undefined =>
  planPerCourt(inputs).find(l => l.roleKey === role)?.qty

describe('planPerCourt', () => {
  it('gives one of each court device per court', () => {
    const i = pro()
    for (const role of [
      'replay_camera', 'junction_box', 'ipad', 'ipad_poe_adapter',
      'ipad_wall_mount', 'apple_tv', 'apple_tv_mount', 'hdmi_cable',
      'display', 'tilt_mount',
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

  // The source quantifies the security camera but defers its junction box with
  // a literal "TBD". Emitting a number here would be a fabricated quantity that
  // reads as authoritative on a printed BOM.
  it('emits security cameras as a count but their junction box as TBD, which is all the source gives', () => {
    const i = pro({ tier: 'autonomous_plus', securityCameras: 4, kisiDoors: 1 })
    expect(qty(i, 'security_camera')).toBe(4)
    expect(qty(i, 'security_junction_box')).toBe('TBD')
    // The REPLAY junction box is genuinely per-court and must not be confused
    // with the security one, despite both being a PFA130-E.
    expect(qty(i, 'junction_box')).toBe(8)
  })

  it('omits security lines entirely when there are none', () => {
    expect(qty(pro(), 'security_camera')).toBeUndefined()
  })

  it('emits a TBD access point line, because silently outputting 0 is how they get forgotten', () => {
    expect(qty(pro(), 'access_point')).toBe('TBD')
  })

  it('emits a TBD fence bracket for PodPlay, matching the doc convention', () => {
    expect(qty(pro(), 'ipad_fence_bracket')).toBe('TBD')
  })

  it('gives a real fence bracket count for Pickleball Kingdom', () => {
    expect(qty(pro({ brand: 'pickleball_kingdom' }), 'ipad_fence_bracket')).toBe(8)
  })
})
