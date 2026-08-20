import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Item } from '@/calculator/types'
import type { StoredLine } from './venueLines'

const rpc = vi.fn()
// getVenue's read chain, stubbed only for the PT409 path below: the RPC rolls
// back before returning anything, so who-and-when comes from a fresh read.
const single = vi.fn(async () => ({
  data: {
    id: 'v1', name: 'Tela Park', courts: 8, tier: 'pro',
    security_cameras: 0, kisi_doors: 0, extended_retention: false,
    backup_internet: false, updated_at: '2026-08-19T09:00:00.000001+00:00',
    created_by_email: 'a@b.c', updated_by_email: 'other@kosmas.com',
  },
  error: null,
}))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc,
    from: () => ({ select: () => ({ eq: () => ({ single }) }) }),
  },
}))

// Each test asserts on its own rpc call by index, so call history must not
// leak from one test into the next.
beforeEach(() => vi.clearAllMocks())

const {
  saveVenueAndLines, UnresolvedLinesError, VenueConflictError,
} = await import('./venueLines')

const catalog = [
  { id: 'i-ups', roleKey: 'ups_1500va', name: 'UPS' },
  { id: 'i-ap', roleKey: 'access_point', name: 'AP' },
] as unknown as Item[]

const venue = {
  id: 'v1', name: 'Tela Park', courts: 8, tier: 'pro' as const,
  securityCameras: 0, kisiDoors: 0, extendedRetention: false,
  backupInternet: false,
  updatedAt: '2026-08-19T07:58:00.123456+00:00',
  createdByEmail: null, updatedByEmail: null,
}

const line = (over: Partial<StoredLine> = {}): StoredLine => ({
  id: 'l1', venueId: 'v1', itemId: 'i-ups', roleKey: 'ups_1500va', qty: 1,
  originRoleKey: null, sortOrder: 0, source: 'formula',
  suppressed: false, note: null, ...over,
})

const ok = (lines: unknown[] = []) => ({
  data: {
    venue: {
      id: 'v1', name: 'Tela Park', courts: 8, tier: 'pro',
      security_cameras: 0, kisi_doors: 0, extended_retention: false,
      backup_internet: false, updated_at: '2026-08-19T08:00:00.654321+00:00',
      created_by_email: 'a@b.c', updated_by_email: 'a@b.c',
    },
    lines,
  },
  error: null,
})

describe('saveVenueAndLines', () => {
  // The whole optimistic lock rests on this string surviving untouched.
  // timestamptz is microsecond-precision; new Date(s).toISOString() truncates
  // to milliseconds, and `is distinct from` is then always true — so every
  // save after the first conflicts, forever, and it reads as a broken lock
  // rather than a formatting bug.
  it('sends the loaded updated_at byte-identically as the lock baseline', async () => {
    rpc.mockResolvedValueOnce(ok())
    await saveVenueAndLines(venue, [], catalog)
    expect(rpc.mock.calls[0][1].p_expected_updated_at)
      .toBe('2026-08-19T07:58:00.123456+00:00')
  })

  // TBD is a real output where the sizing doc declines to give a number. The
  // RPC casts qty with ::int, so letting the sentinel through raises
  // `invalid input syntax for type integer: "TBD"` and the save fails outright.
  it('sends a TBD line as qty 0 with qty_tbd true, never the sentinel itself', async () => {
    rpc.mockResolvedValueOnce(ok())
    await saveVenueAndLines(venue, [line({ qty: 'TBD' })], catalog)
    const sent = rpc.mock.calls[0][1].p_lines[0]
    expect(sent.qty).toBe(0)
    expect(sent.qty_tbd).toBe(true)
  })

  // Print order is the on-screen order. Using the stored sortOrder instead of
  // the array index silently reorders the handed-out materials list after any
  // add, delete or reorder.
  it('numbers sort_order from the array position, not the stored value', async () => {
    rpc.mockResolvedValueOnce(ok())
    await saveVenueAndLines(
      venue,
      [line({ id: 'a', sortOrder: 99 }), line({ id: 'b', itemId: 'i-ap', sortOrder: 3 })],
      catalog,
    )
    expect(rpc.mock.calls[0][1].p_lines.map((l: { sort_order: number }) => l.sort_order))
      .toEqual([0, 1])
  })

  // venue_lines has no role_key column, so the RPC joins items to supply it.
  // If that join is ever dropped, every line comes back roleKey: null,
  // mergeRecalculation finds no counterpart for any formula line, and the next
  // Recalculate deletes the entire BOM. This test is the tripwire.
  it('reads roleKey back off the returned rows so recalculation still matches', async () => {
    rpc.mockResolvedValueOnce(ok([{
      id: 'l9', venue_id: 'v1', item_id: 'i-ups', qty: 1, qty_tbd: false,
      origin_role_key: null, sort_order: 0, source: 'formula',
      suppressed: false, note: null, role_key: 'ups_1500va',
    }]))
    const result = await saveVenueAndLines(venue, [line()], catalog)
    expect(result.lines[0].roleKey).toBe('ups_1500va')
  })

  // The old saveLines filtered these away with no error and no toast: the user
  // saw "Saved" and a line was gone. Raising is only half the fix — nothing
  // may be written either, or the failure is partial.
  it('throws naming the unresolvable lines and sends no RPC at all', async () => {
    const orphan = line({ id: 'x', itemId: '', roleKey: 'flic' })
    await expect(saveVenueAndLines(venue, [orphan], catalog))
      .rejects.toBeInstanceOf(UnresolvedLinesError)
    expect(rpc).not.toHaveBeenCalled()
  })

  // PT409 must be distinguishable, because the conflict dialog it drives
  // offers an "Overwrite theirs" button. P0001 is what Postgres assigns ANY
  // bare RAISE EXCEPTION, so matching on it would offer that button for
  // unrelated failures — and the retry would fail identically.
  it('translates PT409 into a typed conflict, and leaves anything else alone', async () => {
    rpc.mockResolvedValueOnce({
      data: null, error: { code: 'PT409', message: 'venue_conflict' },
    })
    await expect(saveVenueAndLines(venue, [], catalog))
      .rejects.toBeInstanceOf(VenueConflictError)

    rpc.mockResolvedValueOnce({
      data: null, error: { code: '23502', message: 'null value in column "qty"' },
    })
    await expect(saveVenueAndLines(venue, [], catalog))
      .rejects.not.toBeInstanceOf(VenueConflictError)
  })
})
