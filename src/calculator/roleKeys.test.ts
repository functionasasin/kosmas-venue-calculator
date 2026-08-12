import { describe, it, expect } from 'vitest'
import { ROLE_KEYS } from './roleKeys'

describe('ROLE_KEYS', () => {
  it('contains no duplicates, because a duplicate would let two catalog items claim one role', () => {
    expect(new Set(ROLE_KEYS).size).toBe(ROLE_KEYS.length)
  })

  // Removed 2026-08-11 as out of scope for Kosmas. The source sizes every one
  // of these at 1 per court, so the tempting mistake is to re-add the key and
  // let the catalog fill it later — but a role key with no item behind it
  // renders an explicit "no item mapped" row on the materials list, which is
  // worse than the line being absent. Key and item go together.
  it.each([
    'junction_box', 'security_junction_box', 'apple_tv_mount', 'tilt_mount',
    'hdmi_cable',
  ])('has no %s role, since Kosmas does not spec that hardware', key => {
    expect(ROLE_KEYS).not.toContain(key)
  })

  it('keeps the devices those mounts served, so only the mounting hardware went', () => {
    expect(ROLE_KEYS).toContain('replay_camera')
    expect(ROLE_KEYS).toContain('apple_tv')
    expect(ROLE_KEYS).toContain('display')
  })
})
