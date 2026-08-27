import { describe, it, expect } from 'vitest'
import type { Item } from '@/calculator/types'
import {
  itemIdByRole, lineFromRow, resolveLineItems, UnresolvedLinesError,
  VenueConflictError, type StoredLine,
} from './venueTypes'

// venueLines.ts imports the real Supabase client at module load, which throws
// without the VITE_ env vars. Nothing below touches the network.
import { vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

describe('the declarations both backends share', () => {
  // The single most damaging way to get this refactor wrong is to leave a
  // second copy of either class behind. `instanceof` is identity on the class
  // object, and VenueDetail's two recovery dialogs are gated on it — so a
  // duplicate does not fail loudly, it downgrades the conflict dialog and the
  // unresolved-lines dialog into an auto-dismissing toast reading
  // `venue_conflict`, with the user's unsaved edits still on screen and no
  // button that can save them.
  it('is the SAME class object venueLines re-exports, not a copy', async () => {
    const venueLines = await import('./venueLines')
    expect(venueLines.VenueConflictError).toBe(VenueConflictError)
    expect(venueLines.UnresolvedLinesError).toBe(UnresolvedLinesError)
  })

  // The error MESSAGE is the string a toast falls back to when neither
  // instanceof matches, and 0013 raises the same two words from plpgsql. Both
  // backends have to agree on them or a failure reads differently depending on
  // where the venue happens to live.
  it('keeps the wire-level messages the RPC also raises', () => {
    expect(new VenueConflictError(null, 'x', true).message).toBe('venue_conflict')
    expect(new UnresolvedLinesError([]).message).toBe('unresolved_lines')
  })
})

describe('itemIdByRole', () => {
  const catalog = [
    { id: 'i-live', roleKey: 'ups_1500va', isActive: true },
    { id: 'i-dead', roleKey: 'access_point', isActive: false },
    { id: 'i-loose', roleKey: null, isActive: true },
  ] as unknown as Item[]

  // A deactivated item must never be MINTED onto a fresh line. A saved line
  // that already points at one keeps pointing at it — that is what the
  // (inactive) badge exists for — but this map is only ever consulted to fill
  // an EMPTY itemId, so a retired SKU reaching it would put a dead item on a
  // line nobody chose.
  it('offers only active items, so a retired SKU cannot be minted onto a new line', () => {
    const m = itemIdByRole(catalog)
    expect(m.get('ups_1500va')).toBe('i-live')
    expect(m.has('access_point')).toBe(false)
  })

  it('ignores items that hold no role at all', () => {
    expect([...itemIdByRole(catalog).values()]).not.toContain('i-loose')
  })
})

describe('lineFromRow', () => {
  const row = {
    id: 'l1', venue_id: 'v1', item_id: 'i1', role_key: 'ups_1500va',
    qty: 0, qty_tbd: true, origin_role_key: null, sort_order: 3,
    source: 'formula', suppressed: false, note: null,
  }

  // TBD is a real output where the sizing doc declines to give a number.
  // Without the round trip a saved TBD reloads as 0 and prints as 0 on the
  // handed-out materials list — a fabricated quantity reading as authoritative,
  // which is the one thing CLAUDE.md's "don't invent quantities" rule forbids.
  it('restores the TBD sentinel from qty_tbd rather than reporting 0', () => {
    expect(lineFromRow(row).qty).toBe('TBD')
  })

  // venue_lines has no role_key column. The RPC joins items to supply it, and
  // the local backend supplies it from the catalog — but either way a line
  // that comes back without one makes mergeRecalculation find no counterpart
  // for any formula line, and the next Recalculate deletes the whole BOM.
  it('narrows role_key, and drops a role the app has retired rather than typing it', () => {
    expect(lineFromRow(row).roleKey).toBe('ups_1500va')
    expect(lineFromRow({ ...row, role_key: 'ipad_fence_bracket' }).roleKey).toBe(null)
  })
})

describe('resolveLineItems', () => {
  const catalog = [
    { id: 'i-default', roleKey: 'replay_camera', isActive: true },
    { id: 'i-chosen', roleKey: 'replay_camera', isActive: false },
  ] as unknown as Item[]

  const line = (over: Partial<StoredLine> = {}): StoredLine => ({
    id: 'l1', venueId: 'v1', itemId: 'i-chosen', roleKey: 'replay_camera',
    qty: 1, originRoleKey: null, sortOrder: 0, source: 'formula',
    suppressed: false, note: null, ...over,
  })

  // THE FALLBACK ORDER, and it is the whole reason this is one helper rather
  // than a copy in each backend. A line's stored itemId is the venue's actual
  // choice and outranks the role's default; consult the role map first and a
  // venue pinned to the Dahua silently saves the Uniview instead — the same SKU
  // substitution venue_item_choices exists to prevent, with nothing on screen
  // saying so. Inverting these two lines breaks no other test in the suite.
  it('prefers the line\'s own itemId over the role default, never the reverse', () => {
    expect(resolveLineItems([line()], catalog)[0].itemId).toBe('i-chosen')
  })

  // Only mergeRecalculation's freshly minted lines arrive with an empty itemId,
  // and the role map is what fills them.
  it('falls back to the role map only when the line carries no itemId', () => {
    expect(resolveLineItems([line({ itemId: '' })], catalog)[0].itemId)
      .toBe('i-default')
  })

  // Raised rather than filtered away: the old saveLines dropped these silently
  // and reported success, so the user saw "Saved" and a line was gone.
  it('raises rather than dropping a line that resolves to nothing', () => {
    expect(() => resolveLineItems([line({ itemId: '', roleKey: 'flic' })], catalog))
      .toThrow(UnresolvedLinesError)
  })
})
