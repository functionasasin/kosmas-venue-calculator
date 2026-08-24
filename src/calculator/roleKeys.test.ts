import { describe, it, expect } from 'vitest'
import { ROLE_KEYS, ROLE_LABELS, readRoleKey } from './roleKeys'

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

describe('readRoleKey', () => {
  it('passes every live role through unchanged, so the guard cannot mask a real value', () => {
    for (const key of ROLE_KEYS) expect(readRoleKey(key)).toBe(key)
  })

  // `items.role_key` and `venue_lines.origin_role_key` are unconstrained text.
  // The live case is a role this release retired: rows written while it existed
  // still name it, and the removals of 2026-08-11/13 created exactly that.
  it('nulls a retired role rather than letting it pose as a valid one', () => {
    expect(readRoleKey('junction_box')).toBeNull()
    expect(readRoleKey('hdmi_cable')).toBeNull()
  })

  it('nulls anything unrecognised, including absent values', () => {
    expect(readRoleKey('nonsense')).toBeNull()
    expect(readRoleKey('')).toBeNull()
    expect(readRoleKey(null)).toBeNull()
    expect(readRoleKey(undefined)).toBeNull()
  })
})

describe('ROLE_LABELS', () => {
  // A missing label renders `undefined` in a picker and in the recalculation
  // diff. Record<RoleKey, string> already fails the build on an omission —
  // this catches the other direction, a label left behind after a role key is
  // retired, which compiles fine and quietly accumulates.
  it('labels every role key and nothing else', () => {
    expect(Object.keys(ROLE_LABELS).sort()).toEqual([...ROLE_KEYS].sort())
  })

  // These strings are read by whoever holds the printed sheet beside the
  // screen, so they are prose, not identifiers.
  it('uses human wording, never the raw key', () => {
    for (const [key, label] of Object.entries(ROLE_LABELS)) {
      expect(label).not.toBe(key)
      expect(label).not.toMatch(/_/)
    }
  })
})
