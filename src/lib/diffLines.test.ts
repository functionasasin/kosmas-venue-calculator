import { describe, it, expect } from 'vitest'
import type { Item } from '@/calculator/types'
import type { StoredLine } from '@/data/venueLines'
import { diffLines } from './diffLines'

const item = (id: string, name: string, roleKey: string | null): Item => ({
  id, name, category: 'camera', roleKey: roleKey as Item['roleKey'],
  supplier: null, poeWatts: null, mainsWatts: null, rackU: null,
  isActive: true, isDefault: false, notes: null, printNote: null,
})

const catalog = [
  item('uni', 'Uniview Owlview', 'replay_camera'),
  item('dah', 'Dahua 5459T', 'replay_camera'),
  item('rex', 'Push-to-exit button', null),
  item('rex2', 'REX sensor', null),
]

const line = (over: Partial<StoredLine>): StoredLine => ({
  id: 'l', venueId: 'v', itemId: 'uni', roleKey: 'replay_camera', qty: 8,
  originRoleKey: null, sortOrder: 0, source: 'formula',
  suppressed: false, note: null, ...over,
})

describe('diffLines', () => {
  it('reports a quantity change under a human label', () => {
    const rows = diffLines([line({})], [line({ qty: 14 })], catalog)
    expect(rows).toEqual(['~ Replay camera: 8 → 14'])
  })

  // The case the whole comparison exists for: same role, same quantity, a
  // different camera. Invisible before, and a venue could export a PDF naming
  // the wrong one with nothing on the page saying so.
  it('reports an item change that moves no quantity', () => {
    const rows = diffLines([line({})], [line({ itemId: 'dah' })], catalog)
    expect(rows).toEqual(['~ Replay camera: Uniview Owlview → Dahua 5459T'])
  })

  // C5: when a line's quantity AND its item both changed, only the quantity
  // row prints — the item change is suppressed on purpose, because two rows
  // for one line reads as two changes. Written so it would fail if someone
  // later made the `else if` an `if`, which would emit both rows.
  it('reports only the quantity row when a line changed both quantity and item', () => {
    const rows = diffLines(
      [line({})], [line({ qty: 14, itemId: 'dah' })], catalog,
    )
    expect(rows).toEqual(['~ Replay camera: 8 → 14'])
  })

  it('reports additions and removals', () => {
    expect(diffLines([], [line({})], catalog)).toEqual(['+ Replay camera: 8'])
    expect(diffLines([line({})], [], catalog)).toEqual(['− Replay camera: removed'])
  })

  // Manual lines carry roleKey null, so keying on the role alone collapsed
  // every one of them into a single entry rendering `+ null: 3`. They key on
  // their item and label by its name.
  it('keeps null-role manual lines distinct and names them', () => {
    const a = line({ id: 'a', roleKey: null, itemId: 'rex', qty: 2, source: 'manual' })
    const b = line({ id: 'b', roleKey: null, itemId: 'rex2', qty: 1, source: 'manual' })
    const rows = diffLines([], [a, b], catalog)
    expect(rows).toEqual([
      '+ Push-to-exit button: 2',
      '+ REX sensor: 1',
    ])
  })

  // A minted line has no item yet when its role resolves to nothing. It must
  // still be legible rather than rendering `undefined`.
  it('falls back to the role key when no item resolves', () => {
    const rows = diffLines([], [line({ itemId: '', roleKey: 'ups_3000va' })], catalog)
    expect(rows).toEqual(['+ UPS 3000 VA: 8'])
  })

  it('is empty when nothing changed', () => {
    expect(diffLines([line({})], [line({})], catalog)).toEqual([])
  })
})
