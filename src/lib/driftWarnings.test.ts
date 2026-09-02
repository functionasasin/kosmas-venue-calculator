import { describe, it, expect } from 'vitest'
import type { Item } from '@/calculator/types'
import type { RoleKey } from '@/calculator/roleKeys'
import type { StoredLine } from '@/data/venueLines'
import { driftWarnings } from './driftWarnings'

const item = (over: Partial<Item> & { id: string; name: string }): Item => ({
  category: 'camera', roleKey: 'replay_camera', supplier: null,
  poeWatts: null, mainsWatts: null, rackU: null,
  isActive: true, isDefault: false, notes: null, printNote: null,
  ...over,
})

const uniview = item({ id: 'uni', name: 'Uniview Owlview', isDefault: true })
const dahua = item({ id: 'dah', name: 'Dahua 5459T' })
const retired = item({ id: 'old', name: 'Hikvision 2CD', isActive: false })
const ipad = item({ id: 'pad', name: 'iPad 10th gen', roleKey: 'ipad', category: 'tablet' })
const catalog = [uniview, dahua, retired, ipad]

const line = (over: Partial<StoredLine>): StoredLine => ({
  id: 'l', venueId: 'v', itemId: 'uni', roleKey: 'replay_camera', qty: 8,
  originRoleKey: null, sortOrder: 0, source: 'manual',
  suppressed: false, note: null, ...over,
})

const pin = (itemId: string, roleKey: RoleKey = 'replay_camera') =>
  [{ roleKey, itemId }]
/** What the venue is SIZED on — resolveCatalog's `chosen`, not its pins. */
const sizedOn = (itemId: string, roleKey: RoleKey = 'replay_camera') =>
  new Map<RoleKey, string>([[roleKey, itemId]])

describe('driftWarnings', () => {
  // The common case by far, and the one that must stay quiet: a manual line
  // freezes its QUANTITY, which is not this warning's business. Speaking here
  // would put a check on the rail of every venue with a hand-set quantity.
  it('says nothing when the list names the item the venue is sized on', () => {
    const w = driftWarnings(pin('uni'), [line({})], catalog, sizedOn('uni'))
    expect(w).toEqual([])
  })

  // The printed sheet is otherwise where this is discovered — the buyer is
  // quoted a camera the rung, the ports and the PoE budget were not sized for.
  it('names both items when a hand-edited line drifts from the sizing', () => {
    const w = driftWarnings(
      pin('uni'), [line({ itemId: 'dah' })], catalog, sizedOn('uni'),
    )
    expect(w).toHaveLength(1)
    expect(w[0].code).toBe('CHOICE_OVERRIDDEN')
    expect(w[0].message).toContain('"Dahua 5459T"')
    expect(w[0].message).toContain('"Uniview Owlview"')
  })

  // A cross-role swap keeps its NEW roleKey and records the vacated one in
  // originRoleKey, so a plain roleKey match misses it entirely — and this is
  // the worse drift, because nothing on the list fills the role at all.
  it('catches a cross-role swap through originRoleKey', () => {
    const swapped = line({
      itemId: 'pad', roleKey: 'ipad', originRoleKey: 'replay_camera',
    })
    const w = driftWarnings(pin('uni'), [swapped], catalog, sizedOn('uni'))
    expect(w).toHaveLength(1)
    expect(w[0].message).toContain('nothing on this list fills replay camera')
  })

  // A role can hold a hand-edited formula line AND one added by hand. Taking
  // the first match can land on the one that agrees while a second line prints
  // an item the venue is not sized on.
  it('names the drifted line when another line on the same role agrees', () => {
    const w = driftWarnings(
      pin('uni'),
      [line({ id: 'a', itemId: 'uni' }), line({ id: 'b', itemId: 'dah' })],
      catalog, sizedOn('uni'),
    )
    expect(w).toHaveLength(1)
    expect(w[0].message).toContain('"Dahua 5459T"')
  })

  // A formula line is rewritten by the next recalculation, so it cannot drift.
  // Only a hand-edited line is exempt from that and can persist a disagreement.
  it('ignores a formula line naming a different item', () => {
    const w = driftWarnings(
      pin('uni'), [line({ itemId: 'dah', source: 'formula' })],
      catalog, sizedOn('uni'),
    )
    expect(w).toEqual([])
  })

  // A suppressed line is not printed, so it cannot misquote anyone.
  it('ignores a suppressed line', () => {
    const w = driftWarnings(
      pin('uni'), [line({ itemId: 'dah', suppressed: true })],
      catalog, sizedOn('uni'),
    )
    expect(w).toEqual([])
  })

  // ROLE_NO_DEFAULT already says the role fills nothing, and there is no item
  // here to say the list disagrees with.
  it('stays silent for a role that resolved to nothing', () => {
    const w = driftWarnings(
      pin('dah'), [line({ itemId: 'dah' })], catalog, new Map(),
    )
    expect(w).toEqual([])
  })

  // The reason the WHOLE catalog is passed rather than the active-only view:
  // the item a drifted line names has frequently been retired, and "its item"
  // tells the reader nothing they can act on.
  it('names a deactivated item rather than calling it "its item"', () => {
    const w = driftWarnings(
      pin('uni'), [line({ itemId: 'old' })], catalog, sizedOn('uni'),
    )
    expect(w[0].message).toContain('"Hikvision 2CD"')
    expect(w[0].message).not.toContain('its item')
  })
})
