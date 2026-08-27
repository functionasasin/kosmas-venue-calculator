import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  localGetVenue, localListChoices, localListLines, localListVenues,
} from './localVenues'

// localVenues imports ./venues and ./venueItemChoices for their mappers, and
// both import the real client at module load, which throws without the VITE_
// env vars. Same guard as venues.test.ts:6 and venueLines.test.ts:17 — nothing
// in this file touches the network.
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

// One venue's blob, in the snake_case row shape the database uses. Written
// straight into localStorage so the READ path is what is under test — Task 3's
// writers must produce this shape, and a test that used them to set up would
// pass even if both halves were wrong in the same direction.
const KEY = 'pvc:v1:venue:11111111-1111-4111-8111-111111111111'
const ID = 'local_11111111-1111-4111-8111-111111111111'

const blob = (over: Record<string, unknown> = {}) => JSON.stringify({
  schema: 1,
  venue: {
    id: ID, name: 'Tela Park', courts: 8, tier: 'pro',
    security_cameras: 0, kisi_doors: 0, extended_retention: false,
    backup_internet: false,
    created_at: '2026-08-26T10:00:00.000Z',
    updated_at: '2026-08-26T10:00:00.000Z',
    created_by_email: null, updated_by_email: null,
  },
  lines: [{
    id: 'l1', venue_id: ID, item_id: 'i-ap', role_key: 'access_point',
    qty: 0, qty_tbd: true, origin_role_key: null, sort_order: 0,
    source: 'formula', suppressed: false, note: null,
  }],
  choices: [
    { venue_id: ID, role_key: 'replay_camera', item_id: 'i-dahua' },
    { venue_id: ID, role_key: 'ipad_fence_bracket', item_id: 'i-gone' },
  ],
  ...over,
})

beforeEach(() => localStorage.clear())

describe('the local read path', () => {
  it('reads a venue back through the same mapper the database path uses', async () => {
    localStorage.setItem(KEY, blob())
    const v = await localGetVenue(ID)
    expect(v.id).toBe(ID)
    expect(v.courts).toBe(8)
    expect(v.tier).toBe('pro')
  })

  // The database column is plain text with no check constraint and the blob is
  // hand-editable in devtools, so both stores can hold a tier the app no longer
  // offers. venueFromRow runs readTier for the database path; running the same
  // mapper here is what makes that true of localStorage too — otherwise the
  // tier <select> renders an option that does not exist and shows some other
  // tier as current, surfacing only on the next save.
  it('falls back to pro for a retired tier, exactly as the database path does', async () => {
    localStorage.setItem(KEY, blob({
      venue: { ...JSON.parse(blob()).venue, tier: 'pro_plus' },
    }))
    expect((await localGetVenue(ID)).tier).toBe('pro')
  })

  // The lock compares this string verbatim. Reformatting it on read — even
  // into an equal instant — makes every save after the first conflict forever,
  // and it reads as a broken lock rather than a formatting bug.
  it('returns updatedAt byte-identically, never re-derived from a Date', async () => {
    localStorage.setItem(KEY, blob())
    expect((await localGetVenue(ID)).updatedAt).toBe('2026-08-26T10:00:00.000Z')
  })

  it('restores a TBD line rather than reporting the 0 it was stored as', async () => {
    localStorage.setItem(KEY, blob())
    const lines = await localListLines(ID)
    expect(lines[0].qty).toBe('TBD')
    expect(lines[0].roleKey).toBe('access_point')
  })

  // Same narrowing as listChoices: an unrecognised role matches no formula and
  // no picker, and carrying it as a RoleKey would put a phantom entry into the
  // saved choice set, where it would be re-written on every save forever.
  it('drops a choice for a role key the app has retired', async () => {
    localStorage.setItem(KEY, blob())
    expect(await localListChoices(ID)).toEqual([
      { roleKey: 'replay_camera', itemId: 'i-dahua' },
    ])
  })

  // The RPC raises `venue_not_found` with errcode PT404. The message matches so
  // that Plan 3 can give one typed error one sentence, whichever backend the
  // missing venue was addressed to.
  it('throws venue_not_found for a key that is not there', async () => {
    await expect(localGetVenue(ID)).rejects.toThrow('venue_not_found')
  })
})

describe('localListVenues', () => {
  const second = 'pvc:v1:venue:22222222-2222-4222-8222-222222222222'

  // A JSON.parse throw inside a map over enumerated keys takes down the whole
  // Venues list — every venue in the browser becomes unreachable because one is
  // damaged. Each blob therefore parses inside its own try/catch.
  it('costs exactly one row when a blob is unreadable, not the whole list', () => {
    localStorage.setItem(KEY, blob())
    localStorage.setItem(second, '{ not json')
    const { venues, unreadable } = localListVenues()
    expect(venues.map(v => v.name)).toEqual(['Tela Park'])
    expect(unreadable).toEqual([
      { id: 'local_22222222-2222-4222-8222-222222222222', reason: 'unreadable' },
    ])
  })

  // Surfaced, never auto-deleted: it is the user's only copy of that venue, and
  // a build that cannot read it today may be superseded by one that can. The
  // caller gets it as data so Plan 3 can say so on screen.
  it('never deletes an unreadable blob', () => {
    localStorage.setItem(second, '{ not json')
    localListVenues()
    expect(localStorage.getItem(second)).toBe('{ not json')
  })

  it('reports a blob written by a newer build as such, not as corrupt', () => {
    localStorage.setItem(KEY, blob({ schema: 2 }))
    expect(localListVenues().unreadable).toEqual([{ id: ID, reason: 'newer_schema' }])
  })

  // The database path orders by created_at descending. Venue carries no
  // createdAt field, so without an explicit comparator here the local half of
  // the list comes out in whatever order localStorage enumeration happens to
  // give — which is insertion order in every engine today and guaranteed by
  // none of them.
  it('lists newest first by created_at, not in storage order', () => {
    localStorage.setItem(second, blob({
      venue: {
        ...JSON.parse(blob()).venue,
        id: 'local_22222222-2222-4222-8222-222222222222',
        name: 'Helios Beta',
        created_at: '2026-08-27T10:00:00.000Z',
      },
    }))
    localStorage.setItem(KEY, blob())
    expect(localListVenues().venues.map(v => v.name))
      .toEqual(['Helios Beta', 'Tela Park'])
  })

  // The key is the address. If a blob is ever copied to a different key — a
  // hand edit, a future import feature — the key wins, because it is what
  // getVenue, listLines, save and delete all resolve through. A row listed
  // under an id that opens nothing is the worse failure.
  it('builds the id from the key, so the list can never name a venue that will not open', () => {
    localStorage.setItem(second, blob())   // blob's own venue.id is the OTHER uuid
    expect(localListVenues().venues[0].id)
      .toBe('local_22222222-2222-4222-8222-222222222222')
  })

  it('ignores keys that are not venues, so `theme` is not a corrupt venue', () => {
    localStorage.setItem('theme', 'dark')
    expect(localListVenues()).toEqual({ venues: [], unreadable: [] })
  })
})

describe('the boundary validator', () => {
  // venueFromRow is a CAST, not a parse — `r.courts as number`. A truncated or
  // hand-edited blob is trivially available to anyone with devtools, and a
  // missing `courts` reaches calculateBOM as undefined, which sizes the whole
  // venue on NaN: no error, no warning, a printed BOM of NaNs.
  it.each([
    ['no courts at all', { name: 'x', tier: 'pro' }],
    ['courts as a string', { name: 'x', courts: '8', tier: 'pro' }],
    ['courts below one', { name: 'x', courts: 0, tier: 'pro' }],
    ['a null courts', { name: 'x', courts: null, tier: 'pro' }],
    ['no name', { courts: 8, tier: 'pro' }],
  ])('rejects a blob with %s rather than sizing a venue on NaN', (_label, venue) => {
    localStorage.setItem(KEY, JSON.stringify({ schema: 1, venue, lines: [], choices: [] }))
    expect(localListVenues().unreadable).toEqual([{ id: ID, reason: 'unreadable' }])
  })

  it('rejects a blob whose lines are not an array', () => {
    localStorage.setItem(KEY, JSON.stringify({
      schema: 1,
      venue: { name: 'x', courts: 8, tier: 'pro' },
      lines: null, choices: [],
    }))
    expect(localListVenues().unreadable).toEqual([{ id: ID, reason: 'unreadable' }])
  })
})

import { localDeleteVenue, localSaveVenue } from './localVenues'

describe('localSaveVenue', () => {
  // Venues.create calls saveVenue and navigates straight to /venues/<id>. On
  // the database path the INSERT makes the row exist before VenueDetail's
  // loader runs. A local create that only minted an id and deferred the write
  // would land on a screen whose first three reads all throw venue_not_found —
  // which surfaces as an auto-dismissing toast over a permanent "Loading…".
  it('writes a complete, loadable blob before it returns', async () => {
    const v = await localSaveVenue({ name: 'Helios Beta', courts: 14, tier: 'pro' })
    expect(await localGetVenue(v.id)).toMatchObject({ name: 'Helios Beta', courts: 14 })
    expect(await localListLines(v.id)).toEqual([])
    expect(await localListChoices(v.id)).toEqual([])
  })

  // The prefix is what venueStore's resolver dispatches on. A local venue whose
  // id lost it would route its next save to Supabase, where it does not exist.
  it('mints an id carrying the local_ prefix and a key carrying only the uuid', async () => {
    const v = await localSaveVenue({ name: 'Helios Beta', courts: 14 })
    expect(v.id.startsWith('local_')).toBe(true)
    expect(localStorage.getItem(`pvc:v1:venue:${v.id.slice('local_'.length)}`)).not.toBe(null)
  })

  // Same defaults as venues.ts:96-104. A venue created with no tier must size
  // as Pro on both backends, or the same "New venue" dialog produces two
  // different venues depending on whether anyone is signed in.
  it('applies the same column defaults the database INSERT applies', async () => {
    const v = await localSaveVenue({ name: 'Helios Beta' })
    expect(v).toMatchObject({
      courts: 1, tier: 'pro', securityCameras: 0, kisiDoors: 0,
      extendedRetention: false, backupInternet: false,
    })
  })

  // 0006's stamp writes an email from the JWT. There is no JWT here and no
  // account at all, and 0006's own comment says a backfill would invent
  // authorship. Null is the honest value; Plan 3's "Saved in this browser"
  // state is what fills the gap on screen.
  it('invents no authorship', async () => {
    const v = await localSaveVenue({ name: 'Helios Beta' })
    expect(v.createdByEmail).toBe(null)
    expect(v.updatedByEmail).toBe(null)
  })

  it('gives every venue its own key rather than overwriting the last one', async () => {
    const a = await localSaveVenue({ name: 'A' })
    const b = await localSaveVenue({ name: 'B' })
    expect(a.id).not.toBe(b.id)
    expect(localListVenues().venues).toHaveLength(2)
  })
})

describe('localDeleteVenue', () => {
  // One key IS the cascade. On the database side venue_lines.venue_id is
  // `on delete cascade` and venue_item_choices likewise, so a venue's whole
  // materials list goes with it. Removing the single blob gives that for free —
  // and would not, under a three-key layout.
  it('takes the venue, its lines and its choices in one removal', async () => {
    const v = await localSaveVenue({ name: 'A' })
    await localDeleteVenue(v.id)
    expect(localListVenues().venues).toEqual([])
    await expect(localListLines(v.id)).rejects.toThrow('venue_not_found')
  })

  it('is silent about a venue that is already gone, like a DELETE matching no row', async () => {
    await expect(localDeleteVenue('local_deadbeef')).resolves.toBeUndefined()
  })
})

import type { Item } from '@/calculator/types'
import { UnresolvedLinesError, type StoredLine } from './venueTypes'
import { localSaveVenueAndLines } from './localVenues'

const catalog = [
  { id: 'i-ups', roleKey: 'ups_1500va', name: 'UPS', isActive: true },
  { id: 'i-ap', roleKey: 'access_point', name: 'AP', isActive: true },
  { id: 'i-old', roleKey: 'replay_camera', name: 'Owlview', isActive: false },
] as unknown as Item[]

const storedLine = (over: Partial<StoredLine> = {}): StoredLine => ({
  id: 'l1', venueId: 'v', itemId: 'i-ups', roleKey: 'ups_1500va', qty: 1,
  originRoleKey: null, sortOrder: 0, source: 'formula',
  suppressed: false, note: null, ...over,
})

const freshVenue = () => localSaveVenue({ name: 'Tela Park', courts: 8, tier: 'pro' })

describe('localSaveVenueAndLines', () => {
  // mergeRecalculation mints `new:<roleKey>` with venueId: '' and
  // MaterialsTable.add mints `new-manual:<itemId>:<Date.now()>`. The RPC
  // replaces both, because 0013:67 deletes every row for the venue and
  // re-inserts. Left in place, MaterialsTable's update and remove both key on
  // `l.id === line.id`, and React keys on line.id — so two manual adds inside
  // one millisecond edit each other's row.
  it('replaces every minted id with a real uuid, exactly as the RPC does', async () => {
    const v = await freshVenue()
    const out = await localSaveVenueAndLines(
      v,
      [
        storedLine({ id: 'new:ups_1500va', venueId: '' }),
        storedLine({ id: 'new-manual:i-ap:1756200000000', itemId: 'i-ap', roleKey: 'access_point' }),
      ],
      catalog,
      [],
    )
    for (const l of out.lines) {
      expect(l.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(l.venueId).toBe(v.id)
    }
    expect(out.lines[0].id).not.toBe(out.lines[1].id)
  })

  // venue_lines has no role_key column, so the RPC joins items for it
  // (0013:92). A line returned without one makes mergeRecalculation find no
  // counterpart for any formula line, and the next Recalculate DROPS THE ENTIRE
  // MATERIALS LIST (venueLines.ts:85). This is the tripwire for that.
  it('re-derives roleKey from the catalog by itemId, the way the RPC joins it', async () => {
    const v = await freshVenue()
    const out = await localSaveVenueAndLines(
      v, [storedLine({ roleKey: null })], catalog, [],
    )
    expect(out.lines[0].roleKey).toBe('ups_1500va')
  })

  // The one case the catalog cannot answer and the RPC's join can: 0013 joins
  // the WHOLE items table, while this catalog has been narrowed to active items
  // before it ever reaches here. A line whose SKU was deactivated is simply not
  // in it — and that line is exactly the one the (inactive) badge exists to keep
  // on screen. Falling back to the line's own roleKey is what stops the next
  // Recalculate deleting it.
  it('keeps a deactivated line\'s own roleKey, since the narrowed catalog cannot supply one', async () => {
    const v = await freshVenue()
    const out = await localSaveVenueAndLines(
      v, [storedLine({ itemId: 'i-old', roleKey: 'replay_camera' })], catalog, [],
    )
    expect(out.lines[0].roleKey).toBe('replay_camera')
  })

  // Print order is the on-screen order. mergeRecalculation mints sortOrder 0 for
  // every line it adds, so preserving the incoming value reloads the venue in a
  // different order and changes the printed sheet.
  it('renumbers sortOrder from the array position and returns lines in that order', async () => {
    const v = await freshVenue()
    const out = await localSaveVenueAndLines(
      v,
      [
        storedLine({ id: 'a', sortOrder: 99 }),
        storedLine({ id: 'b', itemId: 'i-ap', roleKey: 'access_point', sortOrder: 3 }),
      ],
      catalog,
      [],
    )
    expect(out.lines.map(l => l.sortOrder)).toEqual([0, 1])
    expect(out.lines.map(l => l.itemId)).toEqual(['i-ups', 'i-ap'])
  })

  it('round-trips a TBD line through qty_tbd rather than storing the sentinel', async () => {
    const v = await freshVenue()
    const out = await localSaveVenueAndLines(
      v, [storedLine({ qty: 'TBD' })], catalog, [],
    )
    expect(out.lines[0].qty).toBe('TBD')
    expect(await localListLines(v.id)).toEqual(out.lines)
  })

  // 0013:100 orders choices by role_key. runSave compares the returned set
  // against its snapshot, so an unstable order reads as a change and the venue
  // is dirty the instant it is saved.
  it('returns choices ordered by role key', async () => {
    const v = await freshVenue()
    const out = await localSaveVenueAndLines(v, [], catalog, [
      { roleKey: 'ups_1500va', itemId: 'i-ups' },
      { roleKey: 'access_point', itemId: 'i-ap' },
    ])
    expect(out.choices.map(c => c.roleKey)).toEqual(['access_point', 'ups_1500va'])
  })

  // Parity with saveVenueAndLines, NOT an existence check against the catalog.
  // itemId is authoritative and survives its item's deactivation; only lines
  // mergeRecalculation minted empty resolve through the role map. Validating
  // against the resolved catalog instead would make a venue holding a
  // deactivated line UNSAVEABLE, offering only "Remove these lines and save".
  it('raises UnresolvedLinesError only for a line with no itemId AND no resolvable role', async () => {
    const v = await freshVenue()
    await expect(localSaveVenueAndLines(
      v, [storedLine({ itemId: '', roleKey: 'flic' })], catalog, [],
    )).rejects.toBeInstanceOf(UnresolvedLinesError)
  })

  it('accepts a line pointing at a DEACTIVATED item, because a saved line survives retirement', async () => {
    const v = await freshVenue()
    await expect(localSaveVenueAndLines(
      v, [storedLine({ itemId: 'i-old', roleKey: 'replay_camera' })], catalog, [],
    )).resolves.toBeTruthy()
  })

  // Raised BEFORE anything is written, so the failure is total rather than
  // partial — the same ordering venueLines.ts:237-239 spells out.
  it('writes nothing at all when it raises', async () => {
    const v = await freshVenue()
    await localSaveVenueAndLines(v, [storedLine()], catalog, [])
    const before = localStorage.getItem(`pvc:v1:venue:${v.id.slice(6)}`)
    await expect(localSaveVenueAndLines(
      v, [storedLine({ itemId: '', roleKey: 'flic' })], catalog, [],
    )).rejects.toBeInstanceOf(UnresolvedLinesError)
    expect(localStorage.getItem(`pvc:v1:venue:${v.id.slice(6)}`)).toBe(before)
  })

  // 0006's stamp_venue restores old.created_at on every UPDATE, precisely so a
  // save cannot rewrite when a venue was made. The list's ordering depends on
  // it, so losing it here would silently reshuffle the Venues screen on save.
  it('preserves created_at across a save', async () => {
    const v = await freshVenue()
    const key = `pvc:v1:venue:${v.id.slice(6)}`
    const created = JSON.parse(localStorage.getItem(key) ?? '').venue.created_at
    await localSaveVenueAndLines(v, [], catalog, [])
    expect(JSON.parse(localStorage.getItem(key) ?? '').venue.created_at).toBe(created)
  })

  it('still invents no authorship on update', async () => {
    const v = await freshVenue()
    const out = await localSaveVenueAndLines(v, [], catalog, [])
    expect(out.venue.createdByEmail).toBe(null)
    expect(out.venue.updatedByEmail).toBe(null)
  })

  // One setItem is the transaction. Two writes would re-create the split write
  // 0007 and 0013 exist to eliminate: choices committed, lines not, and a
  // venue's pinned camera disagreeing with its line's item_id.
  it('commits the venue, its lines and its choices in exactly one write', async () => {
    const v = await freshVenue()
    const spy = vi.spyOn(Storage.prototype, 'setItem')
    await localSaveVenueAndLines(v, [storedLine()], catalog, [
      { roleKey: 'ups_1500va', itemId: 'i-ups' },
    ])
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('throws venue_not_found rather than resurrecting a venue that was deleted', async () => {
    const v = await freshVenue()
    await localDeleteVenue(v.id)
    await expect(localSaveVenueAndLines(v, [], catalog, []))
      .rejects.toThrow('venue_not_found')
  })
})

import { VenueConflictError } from './venueTypes'

describe('the local optimistic lock', () => {
  it('advances updatedAt on every save, so a stale baseline is detectable', async () => {
    const v = await freshVenue()
    const first = await localSaveVenueAndLines(v, [], catalog, [])
    expect(first.venue.updatedAt).not.toBe(v.updatedAt)
  })

  // The mirror of what two tabs do: both loaded the venue at baseline B, one
  // saved, the other still holds B.
  it('conflicts when the stored value has moved on since the venue was loaded', async () => {
    const v = await freshVenue()
    await localSaveVenueAndLines(v, [], catalog, [])
    await expect(localSaveVenueAndLines(v, [], catalog, []))
      .rejects.toBeInstanceOf(VenueConflictError)
  })

  // "Overwrite theirs" rebases on conflict.savedAt and re-issues the save
  // (VenueDetail.tsx:550-553). Thrown with an empty savedAt, that button
  // conflicts forever — the "appears to do nothing, twice" failure the comment
  // at :365-369 exists to prevent. The database path re-reads for exactly this
  // reason (venueLines.ts:268-274).
  it('carries the CURRENT stored value, so Overwrite theirs can succeed', async () => {
    const v = await freshVenue()
    const first = await localSaveVenueAndLines(v, [], catalog, [])
    try {
      await localSaveVenueAndLines(v, [], catalog, [])
      expect.unreachable('should have conflicted')
    } catch (e) {
      expect(e).toBeInstanceOf(VenueConflictError)
      expect((e as VenueConflictError).savedAt).toBe(first.venue.updatedAt)
      // Rebasing on it must actually get through.
      await expect(localSaveVenueAndLines(
        { ...v, updatedAt: (e as VenueConflictError).savedAt }, [], catalog, [],
      )).resolves.toBeTruthy()
    }
  })

  // There are no accounts in localStorage. The conflict dialog's
  // "{savedByEmail ?? 'Another account'} saved it" line gets a local-aware
  // sentence in Task 10; null is what tells it which one to use.
  it('names no account, because there are none', async () => {
    const v = await freshVenue()
    await localSaveVenueAndLines(v, [], catalog, [])
    await expect(localSaveVenueAndLines(v, [], catalog, []))
      .rejects.toMatchObject({ savedByEmail: null })
  })

  it('writes nothing when it conflicts', async () => {
    const v = await freshVenue()
    const first = await localSaveVenueAndLines(v, [storedLine()], catalog, [])
    await expect(localSaveVenueAndLines(v, [], catalog, [])).rejects.toThrow()
    expect(await localListLines(v.id)).toEqual(first.lines)
  })

  // Date.prototype.toISOString is MILLISECOND-precision, and two saves inside
  // one millisecond are reachable here in a way they are not against a network:
  // localStorage is synchronous, so Save followed immediately by "Save and
  // leave" can land in the same tick. Identical strings would pass a lock that
  // should conflict. The database uses microseconds for this reason
  // (venues.ts:7-14) and localStorage has no equivalent, so the bump is it.
  it('never mints the value it is replacing, even inside one millisecond', async () => {
    const v = await freshVenue()
    const frozen = new Date('2026-08-26T12:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(frozen)
    try {
      const a = await localSaveVenueAndLines(v, [], catalog, [])
      const b = await localSaveVenueAndLines(a.venue, [], catalog, [])
      expect(b.venue.updatedAt).not.toBe(a.venue.updatedAt)
    } finally {
      vi.useRealTimers()
    }
  })
})
