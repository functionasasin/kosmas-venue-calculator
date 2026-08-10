import { describe, it, expect } from 'vitest'
import { tierLabel, tierOptionLabel, hasCustomAccess } from './tierLabel'

const pro = { tier: 'pro' as const, kisiDoors: 0, securityCameras: 0 }

describe('tierLabel', () => {
  // The Pro/Pro+ distinction was never stored — Pro+ meant "Pro with access or
  // monitoring bolted on", so it is derived from the hardware rather than from
  // a second value someone has to remember to set. This is the whole point of
  // the merge: the label cannot drift from the venue it describes.
  it('reads Pro until access hardware exists, then Pro+', () => {
    expect(tierLabel(pro)).toBe('Pro')
    expect(tierLabel({ ...pro, kisiDoors: 2 })).toBe('Pro+')
    expect(tierLabel({ ...pro, securityCameras: 4 })).toBe('Pro+')
    expect(tierLabel({ ...pro, kisiDoors: 1, securityCameras: 1 })).toBe('Pro+')
  })

  // Autonomous requires at least one Kisi door, so every Autonomous venue has
  // custom access by definition. If the "+" suffix were applied from hardware
  // rather than from the tier, every Autonomous venue would print Autonomous+ —
  // and Autonomous+ means surveillance, which is a different order entirely.
  it('never lets access hardware promote a non-Pro tier', () => {
    expect(tierLabel({ tier: 'autonomous', kisiDoors: 4, securityCameras: 0 }))
      .toBe('Autonomous')
    expect(tierLabel({ tier: 'autonomous_plus', kisiDoors: 4, securityCameras: 8 }))
      .toBe('Autonomous+')
    expect(tierLabel({ tier: 'basic_plus', kisiDoors: 0, securityCameras: 0 }))
      .toBe('Basic+')
  })
})

describe('tierOptionLabel', () => {
  // The picker is a choice made before the door and camera counts are entered,
  // so it cannot resolve the suffix — it has to offer the pair. Resolving it
  // there would show "Pro" on a venue about to become Pro+.
  it('offers Pro as the pair it covers, and every other tier by its own name', () => {
    expect(tierOptionLabel('pro')).toBe('Pro / Pro+')
    expect(tierOptionLabel('basic_plus')).toBe('Basic+')
    expect(tierOptionLabel('autonomous')).toBe('Autonomous')
    expect(tierOptionLabel('autonomous_plus')).toBe('Autonomous+')
  })
})

describe('hasCustomAccess', () => {
  it('is what the Pro+ label and the scope/lead-time warnings both key off', () => {
    expect(hasCustomAccess({ kisiDoors: 0, securityCameras: 0 })).toBe(false)
    expect(hasCustomAccess({ kisiDoors: 1, securityCameras: 0 })).toBe(true)
    expect(hasCustomAccess({ kisiDoors: 0, securityCameras: 1 })).toBe(true)
  })
})
