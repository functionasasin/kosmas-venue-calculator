import { describe, it, expect } from 'vitest'
import { mergeRecalculation } from './venueLines'
import type { StoredLine } from './venueLines'
import type { CalculatedLine } from '@/calculator/types'
import type { Item } from '@/calculator/types'

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

// Two cameras on one role is impossible for this fixture by construction —
// mergeRecalculation receives an ALREADY RESOLVED catalog, so exactly one
// active item holds each role. That is the contract this test pins.
const resolved = (over: Partial<Item> & { id: string; roleKey: string }): Item => ({
  name: over.id, category: 'test', supplier: null,
  poeWatts: null, mainsWatts: null, rackU: null,
  isActive: true, isDefault: true, notes: null, printNote: null,
  ...over,
} as Item)

const catalog: Item[] = [
  resolved({ id: 'item-dahua', roleKey: 'replay_camera' }),
  resolved({ id: 'item-flic', roleKey: 'flic' }),
  resolved({ id: 'item-signage', roleKey: 'signage' }),
  resolved({ id: 'item-access_point', roleKey: 'access_point' }),
  resolved({ id: 'item-switch_48_pro', roleKey: 'switch_48_pro' }),
  resolved({ id: 'item-switch_24_pro', roleKey: 'switch_24_pro' }),
]

describe('mergeRecalculation', () => {
  it('updates formula lines to the new quantity', () => {
    const r = mergeRecalculation([stored('flic', 18, 'formula')], [calc('flic', 22)], catalog)
    expect(r.find(l => l.roleKey === 'flic')?.qty).toBe(22)
  })

  it('leaves manual lines alone, so a deliberate correction survives', () => {
    const r = mergeRecalculation([stored('flic', 16, 'manual')], [calc('flic', 22)], catalog)
    expect(r.find(l => l.roleKey === 'flic')?.qty).toBe(16)
  })

  it('keeps suppressed lines suppressed, so a deleted line does not resurrect', () => {
    const r = mergeRecalculation(
      [stored('signage', 16, 'formula', true)], [calc('signage', 20)], catalog,
    )
    expect(r.find(l => l.roleKey === 'signage')?.suppressed).toBe(true)
  })

  it('keeps manual lines the formula never emits, like the client-chosen access points', () => {
    const r = mergeRecalculation([stored('access_point', 3, 'manual')], [], catalog)
    expect(r.find(l => l.roleKey === 'access_point')?.qty).toBe(3)
  })

  it('drops formula lines the new inputs no longer produce', () => {
    const r = mergeRecalculation([stored('switch_24_pro', 1, 'formula')], [], catalog)
    expect(r.find(l => l.roleKey === 'switch_24_pro')).toBeUndefined()
  })

  it('adds newly produced formula lines', () => {
    const r = mergeRecalculation([], [calc('switch_48_pro', 1)], catalog)
    expect(r.find(l => l.roleKey === 'switch_48_pro')?.source).toBe('formula')
  })

  it('does not resurrect the original alongside a swapped SKU', () => {
    // The user swapped replay_camera for security_camera. Without tracking the
    // vacated role, recalculation sees replay_camera missing and re-adds it,
    // leaving the venue with both cameras.
    const swapped = stored('security_camera', 8, 'manual', false, 'replay_camera')
    const r = mergeRecalculation([swapped], [calc('replay_camera', 8)], catalog)
    expect(r).toHaveLength(1)
    expect(r[0].roleKey).toBe('security_camera')
  })
})

describe('mergeRecalculation and the resolved item', () => {
  // The whole feature in one assertion. Without this the picker moves the UPS
  // rung while the BOM line, the saved item_id and the PDF all keep the old
  // camera.
  it('re-points a formula line onto the resolved item', () => {
    const line = stored('replay_camera', 8, 'formula')  // itemId 'item-replay_camera'
    const r = mergeRecalculation([line], [calc('replay_camera', 8)], catalog)
    expect(r.find(l => l.roleKey === 'replay_camera')!.itemId).toBe('item-dahua')
  })

  // A hand-edited line is an override, and overriding it back would defeat the
  // point. The consequence is real and is surfaced as CHOICE_OVERRIDDEN rather
  // than left to be discovered: a venue whose camera line was swapped or
  // quantity-edited by hand does NOT follow the venue's picker.
  it('leaves a manual line\'s item alone', () => {
    const line = stored('replay_camera', 8, 'manual')
    const r = mergeRecalculation([line], [calc('replay_camera', 8)], catalog)
    expect(r.find(l => l.roleKey === 'replay_camera')!.itemId)
      .toBe('item-replay_camera')
  })

  // Minted lines used to carry itemId '' and resolve at save time through
  // itemIdFor. Filling it here means the diff can compare items on a freshly
  // calculated line too, and save's resolution becomes a fallback rather than
  // the only path.
  it('mints a new line already pointing at the resolved item', () => {
    const r = mergeRecalculation([], [calc('flic', 18)], catalog)
    expect(r.find(l => l.roleKey === 'flic')!.itemId).toBe('item-flic')
  })

  // A role with no active item must still mint the line — it renders as
  // "No active item mapped for …" on screen and raises UnresolvedLinesError on
  // save. Silently dropping it would hide a catalog problem.
  it('mints an empty itemId when the role resolves to nothing', () => {
    const r = mergeRecalculation([], [calc('ups_1500va', 1)], catalog)
    expect(r.find(l => l.roleKey === 'ups_1500va')!.itemId).toBe('')
  })

  it('leaves a suppressed line untouched, item and all', () => {
    const line = stored('replay_camera', 8, 'formula', true)
    const r = mergeRecalculation([line], [calc('replay_camera', 8)], catalog)
    const out = r.find(l => l.roleKey === 'replay_camera')!
    expect(out.suppressed).toBe(true)
    expect(out.itemId).toBe('item-replay_camera')
  })
})
