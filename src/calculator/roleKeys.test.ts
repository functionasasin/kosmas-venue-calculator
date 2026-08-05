import { describe, it, expect } from 'vitest'
import { ROLE_KEYS } from './roleKeys'

describe('ROLE_KEYS', () => {
  it('contains no duplicates, because a duplicate would let two catalog items claim one role', () => {
    expect(new Set(ROLE_KEYS).size).toBe(ROLE_KEYS.length)
  })

  it('separates replay and security junction boxes, because a venue with both needs both counts', () => {
    expect(ROLE_KEYS).toContain('junction_box')
    expect(ROLE_KEYS).toContain('security_junction_box')
  })
})
