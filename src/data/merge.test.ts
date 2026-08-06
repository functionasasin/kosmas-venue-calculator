import { describe, it, expect } from 'vitest'
import { mergeRecalculation } from './venueLines'
import type { StoredLine } from './venueLines'
import type { CalculatedLine } from '@/calculator/types'

const stored = (
  roleKey: string, qty: number, source: 'formula' | 'manual',
  suppressed = false, originRoleKey: string | null = null,
): StoredLine => ({
  id: roleKey, venueId: 'v', itemId: `item-${roleKey}`,
  roleKey: roleKey as never, qty, sortOrder: 0, source,
  suppressed, originRoleKey: originRoleKey as never, note: null,
})

const calc = (roleKey: string, qty: number): CalculatedLine =>
  ({ roleKey: roleKey as never, qty, formula: '' })

describe('mergeRecalculation', () => {
  it('updates formula lines to the new quantity', () => {
    const r = mergeRecalculation([stored('flic', 18, 'formula')], [calc('flic', 22)])
    expect(r.find(l => l.roleKey === 'flic')?.qty).toBe(22)
  })

  it('leaves manual lines alone, so a deliberate correction survives', () => {
    const r = mergeRecalculation([stored('flic', 16, 'manual')], [calc('flic', 22)])
    expect(r.find(l => l.roleKey === 'flic')?.qty).toBe(16)
  })

  it('keeps suppressed lines suppressed, so a deleted line does not resurrect', () => {
    const r = mergeRecalculation(
      [stored('signage', 16, 'formula', true)], [calc('signage', 20)],
    )
    expect(r.find(l => l.roleKey === 'signage')?.suppressed).toBe(true)
  })

  it('keeps manual lines the formula never emits, like the client-chosen access points', () => {
    const r = mergeRecalculation([stored('access_point', 3, 'manual')], [])
    expect(r.find(l => l.roleKey === 'access_point')?.qty).toBe(3)
  })

  it('drops formula lines the new inputs no longer produce', () => {
    const r = mergeRecalculation([stored('switch_24_pro', 1, 'formula')], [])
    expect(r.find(l => l.roleKey === 'switch_24_pro')).toBeUndefined()
  })

  it('adds newly produced formula lines', () => {
    const r = mergeRecalculation([], [calc('switch_48_pro', 1)])
    expect(r.find(l => l.roleKey === 'switch_48_pro')?.source).toBe('formula')
  })

  it('does not resurrect the original alongside a swapped SKU', () => {
    // The user swapped replay_camera for security_camera. Without tracking the
    // vacated role, recalculation sees replay_camera missing and re-adds it,
    // leaving the venue with both cameras.
    const swapped = stored('security_camera', 8, 'manual', false, 'replay_camera')
    const r = mergeRecalculation([swapped], [calc('replay_camera', 8)])
    expect(r).toHaveLength(1)
    expect(r[0].roleKey).toBe('security_camera')
  })
})
