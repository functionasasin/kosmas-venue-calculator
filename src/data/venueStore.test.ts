import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Item } from '@/calculator/types'
import { UnresolvedLinesError, VenueConflictError } from './venueTypes'

// Every Supabase call in this file is a spy. A test that let one through would
// hit production, and the point of these tests is precisely that some of them
// must NOT be reached.
const rpc = vi.fn(async () => ({ data: { venue: {}, lines: [], choices: [] }, error: null }))
const from = vi.fn(() => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    delete: () => chain,
    insert: () => chain,
    single: async () => ({
      data: {
        id: DB_ID, name: 'Tela Park', courts: 8, tier: 'pro',
        security_cameras: 0, kisi_doors: 0, extended_retention: false,
        backup_internet: false, updated_at: 'x',
        created_by_email: null, updated_by_email: null,
      },
      error: null,
    }),
    then: (r: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(r),
  }
  return chain
})
vi.mock('@/lib/supabase', () => ({ supabase: { rpc, from } }))

const store = await import('./venueStore')
const { localSaveVenue } = await import('./localVenues')

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

const venue = (id: string) => ({
  id, name: 'Tela Park', courts: 8, tier: 'pro' as const,
  securityCameras: 0, kisiDoors: 0, extendedRetention: false,
  backupInternet: false, updatedAt: '2026-08-26T10:00:00.000Z',
  createdByEmail: null, updatedByEmail: null,
})

const DB_ID = '11111111-1111-4111-8111-111111111111'

describe('storage dispatch', () => {
  // THE load-bearing decision of this whole design. Dispatching on "is there a
  // session" is unsafe because the session can vanish mid-screen — Supabase
  // fires SIGNED_OUT on refresh-token failure and on sign-out in another tab.
  // Under a session predicate, a mounted VenueDetail holding a DATABASE venue
  // would route its next save into localStorage, write it there, and toast
  // "Saved" while the database row went untouched. That is the HardwareChoices
  // failure again: two paths, the wrong one reporting success.
  it('never lets a database venue reach localStorage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    await store.saveVenueAndLines(venue(DB_ID), [], [], [])
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(setItem).not.toHaveBeenCalled()
    setItem.mockRestore()
  })

  // The other direction, and it fails LOUDLY rather than silently if it ever
  // breaks: a local_ id is not a uuid, so Postgres would reject it — but only
  // after the request left the browser.
  it('never lets a local venue reach Supabase', async () => {
    const v = await localSaveVenue({ name: 'Tela Park', courts: 8 })
    await store.saveVenueAndLines(v, [], [], [])
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['getVenue', (id: string) => store.getVenue(id)],
    ['listLines', (id: string) => store.listLines(id)],
    ['listChoices', (id: string) => store.listChoices(id)],
    ['deleteVenue', (id: string) => store.deleteVenue(id)],
  ])('routes %s by the id prefix, not by anything ambient', async (_name, call) => {
    const v = await localSaveVenue({ name: 'Tela Park', courts: 8 })
    await call(v.id)
    expect(from).not.toHaveBeenCalled()

    await call(DB_ID)
    expect(from).toHaveBeenCalled()
  })

  // Re-exported for a surface that wants to NAME where a venue lives — Plan 3's
  // "This browser" badge. The conflict dialog deliberately does not use it: it
  // reads VenueConflictError.local, so no screen has to ask.
  it('re-exports the prefix predicate as part of the store API', () => {
    expect(store.isLocalVenueId('local_abc')).toBe(true)
    expect(store.isLocalVenueId(DB_ID)).toBe(false)
  })
})

describe('listVenues', () => {
  it('returns only local venues when nobody is signed in, and asks Supabase nothing', async () => {
    await localSaveVenue({ name: 'Prospect A' })
    const { venues } = await store.listVenues(false)
    expect(venues.map(v => v.name)).toEqual(['Prospect A'])
    expect(from).not.toHaveBeenCalled()
  })

  it('asks Supabase when someone is', async () => {
    await store.listVenues(true)
    expect(from).toHaveBeenCalledWith('venues')
  })

  // Local first, then database, each half newest-first. Venue carries no
  // createdAt field, so the two halves cannot be interleaved by creation date
  // through the existing shape — and without a stated rule the local half comes
  // out in whatever order localStorage enumeration happens to give. Two groups
  // that read as two groups is what Plan 3's "This browser" badge pairs with.
  it('puts the local venues first, so the list reads as two groups', async () => {
    from.mockImplementationOnce(() => ({
      select: () => ({
        order: () => Promise.resolve({
          data: [{
            id: DB_ID, name: 'Tela Park', courts: 8, tier: 'pro',
            security_cameras: 0, kisi_doors: 0, extended_retention: false,
            backup_internet: false, updated_at: 'x',
            created_by_email: null, updated_by_email: null,
          }],
          error: null,
        }),
      }),
    }) as never)
    await localSaveVenue({ name: 'Prospect A' })
    const { venues } = await store.listVenues(true)
    expect(venues.map(v => v.name)).toEqual(['Prospect A', 'Tela Park'])
  })

  // An unreadable blob is surfaced, never auto-deleted — it is the user's only
  // copy. Carrying it out of the data layer as data is what lets Plan 3 say so
  // on screen instead of the venue simply not being there.
  it('carries unreadable local blobs out rather than swallowing them', async () => {
    localStorage.setItem('pvc:v1:venue:aaaa', '{ not json')
    expect((await store.listVenues(false)).unreadable)
      .toEqual([{ id: 'local_aaaa', reason: 'unreadable' }])
  })
})

describe('saveVenue', () => {
  it('creates in the database when signed in', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    await store.saveVenue({ name: 'Tela Park', courts: 8 }, true)
    expect(from).toHaveBeenCalledWith('venues')
    expect(setItem).not.toHaveBeenCalled()
    setItem.mockRestore()
  })

  it('creates in this browser when not', async () => {
    const v = await store.saveVenue({ name: 'Tela Park', courts: 8 }, false)
    expect(v.id.startsWith('local_')).toBe(true)
    expect(from).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// A MODEL of save_venue (0013), not save_venue itself.
//
// Every line here is traceable to the migration:
//   0013:48-51   row not found            -> PT404 venue_not_found
//   0013:53-55   baseline is distinct     -> PT409 venue_conflict
//   0013:67-76   ALL lines deleted and re-inserted, so ids are always fresh
//   0013:91-96   role_key JOINED from items; rows ordered by sort_order
//   0013:99-101  choices ordered by role_key
//   0006:22-32   updated_at and the email stamps are written by the trigger
//
// It cannot prove the SQL is right. What it does is state the contract once, so
// that the LOCAL implementation is measured against something other than its
// own source. If 0013 changes, this changes with it, and localVenues follows.
//
// SEVEN of the nine assertions below run REAL client code on the supabase arm —
// venueFromRow/readTier, lineFromRow's qty_tbd, choiceFromRow's retired-key
// drop, saveVenueAndLines' `sort_order: index` renumber, its unresolved-lines
// pre-check, and the PT409 re-read. TWO do not: `returns a roleKey on every
// saved line` and `replaces minted line ids with real ones` assert, on that
// arm, only that this model does what it was written to do. They are kept in
// the shared block because they are the contract BOTH backends owe, and they
// bite on the local arm — but nobody should read a green supabase case for
// those two as evidence about 0013.
// ---------------------------------------------------------------------------

interface Seed {
  tier?: string
  updatedAt?: string
  lines?: {
    itemId: string
    roleKey: string | null
    qty?: number
    qtyTbd?: boolean
    sortOrder?: number
    source?: 'formula' | 'manual'
  }[]
  choices?: { roleKey: string; itemId: string }[]
}

const CATALOG = [
  { id: 'i-ups', roleKey: 'ups_1500va', name: 'UPS', isActive: true },
  { id: 'i-ap', roleKey: 'access_point', name: 'AP', isActive: true },
] as unknown as Item[]

const BASELINE = '2026-08-19T07:58:00.123456+00:00'

const seedRow = (id: string, s: Seed) => ({
  id, name: 'Tela Park', courts: 8, tier: s.tier ?? 'pro',
  security_cameras: 0, kisi_doors: 0, extended_retention: false,
  backup_internet: false,
  created_at: '2026-08-19T07:00:00.000000+00:00',
  updated_at: s.updatedAt ?? BASELINE,
  created_by_email: null, updated_by_email: null,
})

const seedLineRows = (id: string, s: Seed) =>
  (s.lines ?? []).map((l, i) => ({
    id: `seed-${i}`, venue_id: id, item_id: l.itemId, role_key: l.roleKey,
    qty: l.qty ?? 1, qty_tbd: l.qtyTbd ?? false, origin_role_key: null,
    sort_order: l.sortOrder ?? i, source: l.source ?? 'formula',
    suppressed: false, note: null,
  }))

const seedChoiceRows = (id: string, s: Seed) =>
  (s.choices ?? []).map(c => ({ venue_id: id, role_key: c.roleKey, item_id: c.itemId }))

/** The in-memory relations the Supabase arm reads and the model writes. */
const pg = { venue: null as Record<string, unknown> | null, lines: [], choices: [] } as {
  venue: Record<string, unknown> | null
  lines: Record<string, unknown>[]
  choices: Record<string, unknown>[]
}

const installSupabaseModel = () => {
  pg.venue = null; pg.lines = []; pg.choices = []

  // PostgREST builders are thenables, which is what lets `await
  // supabase.from(...).select(...).eq(...)` work without a terminal call. The
  // `then` below is that, and nothing else here needs to be faithful — the two
  // read chains this codebase uses are select/eq/single and
  // select/eq/order.
  from.mockImplementation(((table: string) => {
    const rows = () =>
      table === 'venues' ? (pg.venue ? [pg.venue] : [])
      : table === 'venue_lines' ? pg.lines
      : pg.choices
    const chain: Record<string, unknown> = {
      select: () => chain, eq: () => chain, order: () => chain,
      insert: () => chain, delete: () => chain,
      single: async () => ({
        data: rows()[0] ?? null,
        error: rows()[0] ? null : { code: 'PGRST116', message: 'no rows' },
      }),
      then: (r: (v: unknown) => unknown) =>
        Promise.resolve({ data: rows(), error: null }).then(r),
    }
    return chain
  }) as never)

  rpc.mockImplementation((async (_name: string, args: {
    p_venue: Record<string, unknown>
    p_lines: Record<string, unknown>[]
    p_choices: { role_key: string; item_id: string }[]
    p_expected_updated_at: string
  }) => {
    if (!pg.venue) return { data: null, error: { code: 'PT404', message: 'venue_not_found' } }
    if (pg.venue.updated_at !== args.p_expected_updated_at) {
      return { data: null, error: { code: 'PT409', message: 'venue_conflict' } }
    }

    pg.venue = {
      ...pg.venue,
      name: args.p_venue.name,
      courts: args.p_venue.courts,
      tier: args.p_venue.tier,
      security_cameras: args.p_venue.security_cameras,
      kisi_doors: args.p_venue.kisi_doors,
      extended_retention: args.p_venue.extended_retention,
      backup_internet: args.p_venue.backup_internet,
      // The trigger, not the client (0006).
      updated_at: new Date().toISOString(),
      updated_by_email: null,
    }

    // 0013:67 — delete then insert, so every line id is new.
    pg.lines = args.p_lines.map(l => ({ ...l, id: crypto.randomUUID(), venue_id: pg.venue!.id }))
    pg.choices = args.p_choices.map(c => ({ ...c, venue_id: pg.venue!.id }))

    const roleOf = new Map(CATALOG.map(i => [i.id, i.roleKey]))
    return {
      data: {
        venue: pg.venue,
        // 0013:92 — role_key joined from items; ordered by sort_order.
        lines: [...pg.lines]
          .sort((a, b) => (a.sort_order as number) - (b.sort_order as number))
          .map(l => ({ ...l, role_key: roleOf.get(l.item_id as string) ?? null })),
        // 0013:100 — ordered by role_key.
        choices: [...pg.choices].sort((a, b) =>
          (a.role_key as string) < (b.role_key as string) ? -1 : 1),
      },
      error: null,
    }
  }) as never)
}

interface Arm {
  id: string
  seed(s: Seed): void
}

const supabaseArm = (): Arm => {
  const id = DB_ID
  installSupabaseModel()
  return {
    id,
    seed(s) {
      pg.venue = seedRow(id, s)
      // The read path uses select('*, items(role_key)') and reads
      // r.items?.role_key, so the seeded rows carry the join's shape.
      pg.lines = seedLineRows(id, s).map(r => ({ ...r, items: { role_key: r.role_key } }))
      pg.choices = seedChoiceRows(id, s)
    },
  }
}

const localArm = (): Arm => {
  const uuid = '22222222-2222-4222-8222-222222222222'
  const id = `local_${uuid}`
  return {
    id,
    seed(s) {
      localStorage.setItem(`pvc:v1:venue:${uuid}`, JSON.stringify({
        schema: 1,
        venue: seedRow(id, s),
        lines: seedLineRows(id, s),
        choices: seedChoiceRows(id, s),
      }))
    },
  }
}

describe.each([
  ['supabase', supabaseArm],
  ['local', localArm],
])('the %s backend honours the storage contract', (_name, makeArm) => {
  let arm: Arm

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    arm = makeArm()
  })

  // venues.tier is plain text with no check constraint and the local blob is
  // hand-editable, so BOTH stores can hold a tier the app no longer offers.
  // Without the fallback the tier <select> renders an option that does not
  // exist and shows some other tier as current — surfacing only on the next
  // save, as a value nobody chose.
  it('falls back to pro for a tier the app has retired', async () => {
    arm.seed({ tier: 'pro_plus' })
    expect((await store.getVenue(arm.id)).tier).toBe('pro')
  })

  // The whole optimistic lock rests on this string surviving untouched. A round
  // trip through a Date truncates microseconds, after which the baseline never
  // matches and EVERY save conflicts — a failure that reads as a broken lock
  // rather than a formatting bug.
  it('returns updatedAt byte-identically', async () => {
    arm.seed({})
    expect((await store.getVenue(arm.id)).updatedAt).toBe(BASELINE)
  })

  // TBD is a real output where the sizing doc declines to give a number.
  // Without the round trip a saved TBD reloads as 0 and prints as 0 on a sheet
  // handed to a buyer.
  it('round-trips the TBD sentinel through qty_tbd', async () => {
    arm.seed({ lines: [{ itemId: 'i-ap', roleKey: 'access_point', qty: 0, qtyTbd: true }] })
    expect((await store.listLines(arm.id))[0].qty).toBe('TBD')
  })

  // role_key is unconstrained text in both stores. Carrying an unrecognised one
  // through as a RoleKey would put a phantom entry into the saved choice set,
  // where it would be re-written on every save forever.
  it('drops a choice naming a role key the app no longer knows', async () => {
    arm.seed({
      choices: [
        { roleKey: 'replay_camera', itemId: 'i-ups' },
        { roleKey: 'ipad_fence_bracket', itemId: 'i-ap' },
      ],
    })
    expect(await store.listChoices(arm.id))
      .toEqual([{ roleKey: 'replay_camera', itemId: 'i-ups' }])
  })

  // venue_lines has no role_key column. A line returned without one makes
  // mergeRecalculation find no counterpart for any formula line, and the next
  // Recalculate deletes the entire materials list.
  it('returns a roleKey on every saved line', async () => {
    arm.seed({})
    const v = await store.getVenue(arm.id)
    const out = await store.saveVenueAndLines(v, [
      { id: 'new:ups_1500va', venueId: '', itemId: 'i-ups', roleKey: null, qty: 1,
        originRoleKey: null, sortOrder: 0, source: 'formula', suppressed: false, note: null },
    ], CATALOG, [])
    expect(out.lines[0].roleKey).toBe('ups_1500va')
  })

  // Print order is the on-screen order. mergeRecalculation mints sortOrder 0 for
  // every line it adds, so preserving the incoming value reloads the venue in a
  // different order and changes the printed sheet.
  it('renumbers sortOrder from the array position and returns lines in that order', async () => {
    arm.seed({})
    const v = await store.getVenue(arm.id)
    const line = (itemId: string, sortOrder: number) => ({
      id: `x-${itemId}`, venueId: v.id, itemId, roleKey: null as null, qty: 1,
      originRoleKey: null, sortOrder, source: 'formula' as const,
      suppressed: false, note: null,
    })
    const out = await store.saveVenueAndLines(
      v, [line('i-ap', 99), line('i-ups', 3)], CATALOG, [],
    )
    expect(out.lines.map(l => l.sortOrder)).toEqual([0, 1])
    expect(out.lines.map(l => l.itemId)).toEqual(['i-ap', 'i-ups'])
  })

  // Both minted-id forms — mergeRecalculation's `new:<roleKey>` and
  // MaterialsTable's `new-manual:<itemId>:<Date.now()>` — must be replaced.
  // MaterialsTable's update and remove both key on l.id and React keys on it,
  // so two manual adds in the same millisecond otherwise edit the wrong row.
  it('replaces minted line ids with real ones', async () => {
    arm.seed({})
    const v = await store.getVenue(arm.id)
    const out = await store.saveVenueAndLines(v, [
      { id: 'new-manual:i-ups:1756200000000', venueId: '', itemId: 'i-ups',
        roleKey: 'ups_1500va', qty: 1, originRoleKey: null, sortOrder: 0,
        source: 'manual', suppressed: false, note: null },
    ], CATALOG, [])
    expect(out.lines[0].id).not.toMatch(/^new/)
    expect(out.lines[0].id).toMatch(/^[0-9a-f-]{36}$/)
  })

  // The old saveLines filtered these away with no error and no toast: the user
  // saw "Saved" and a line was gone. Raising is only half the fix — nothing may
  // be written either, or the failure is partial.
  it('raises UnresolvedLinesError and leaves the stored list untouched', async () => {
    arm.seed({ lines: [{ itemId: 'i-ups', roleKey: 'ups_1500va' }] })
    const v = await store.getVenue(arm.id)
    const before = await store.listLines(arm.id)
    await expect(store.saveVenueAndLines(v, [
      { id: 'x', venueId: v.id, itemId: '', roleKey: 'flic', qty: 1,
        originRoleKey: null, sortOrder: 0, source: 'formula', suppressed: false, note: null },
    ], CATALOG, [])).rejects.toBeInstanceOf(UnresolvedLinesError)
    expect(await store.listLines(arm.id)).toEqual(before)
  })

  // The conflict dialog offers "Overwrite theirs", which rebases on savedAt and
  // re-issues the save. Thrown with an empty savedAt that button conflicts
  // forever — the "appears to do nothing, twice" failure.
  it('raises VenueConflictError carrying a usable savedAt when the baseline is stale', async () => {
    arm.seed({})
    const v = await store.getVenue(arm.id)
    const stale = { ...v, updatedAt: '2026-01-01T00:00:00.000000+00:00' }
    await expect(store.saveVenueAndLines(stale, [], CATALOG, []))
      .rejects.toBeInstanceOf(VenueConflictError)
    try {
      await store.saveVenueAndLines(stale, [], CATALOG, [])
    } catch (e) {
      expect((e as VenueConflictError).savedAt).toBe(BASELINE)
    }
  })
})
