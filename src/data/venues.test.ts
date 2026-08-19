import { describe, it, expect, vi } from 'vitest'

// venues.ts pulls in the real client at import time, which throws without the
// VITE_ env vars. Nothing here touches the network — only the pure coercion.
const supabaseMock: Record<string, unknown> = {}
vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }))

const { readTier } = await import('./venues')

describe('readTier', () => {
  // The failure this guards is silent, which is why it is worth a test: an
  // unrecognised tier makes the <select> render a value matching no option, so
  // the form displays some other tier as current while the database still holds
  // the old one — and the mismatch only surfaces on the next save.
  it('passes every live tier through untouched, so the guard cannot mask a real value', () => {
    for (const t of ['basic', 'basic_plus', 'pro', 'autonomous', 'autonomous_plus'] as const) {
      expect(readTier(t)).toBe(t)
    }
  })

  // tiers-reference.md § lineup confirmed 2026-08-11 — Pro+ was removed. The
  // tier column is plain `text` with no check constraint, so a row written
  // while Pro+ existed can still hold it.
  //
  // The fallback is NOT a claim that Pro+ was really Pro: Pro has no door
  // access and no monitoring, which is exactly what Pro+ was recorded as
  // adding. It only guarantees the select renders a tier that exists. If such a
  // row carries doors or cameras, Pro's gates block the calculation, which is
  // the intended outcome — the tier has to be re-picked deliberately.
  it('falls back to pro for a removed tier rather than leaving the select broken', () => {
    expect(readTier('pro_plus')).toBe('pro')
  })

  it('falls back for any unrecognised value, not just the tiers we happen to know about', () => {
    expect(readTier('enterprise')).toBe('pro')
    expect(readTier(null)).toBe('pro')
  })
})

// saveVenue is the CREATE path only. It was an upsert, which meant an id in
// the payload silently took the ON CONFLICT DO UPDATE branch — a second write
// into venues with no baseline check and no row lock, bypassing the whole
// point of save_venue. The two tests below pin the two halves of that: it must
// insert, and it must not send a timestamp the trigger owns.
describe('saveVenue', () => {
  // Records which PostgREST verb was used and with what row, so the test can
  // assert on the call rather than on a round trip we are not making.
  async function runSaveVenue(input: { name: string; courts: number }) {
    const calls: { method?: string; row?: Record<string, unknown> } = {}
    const single = async () => ({
      data: {
        id: 'v1', name: input.name, courts: input.courts, tier: 'pro',
        security_cameras: 0, kisi_doors: 0, extended_retention: false,
        backup_internet: false, updated_at: '2026-08-19T00:00:00.000001+00:00',
        created_by_email: 'a@b.c', updated_by_email: 'a@b.c',
      },
      error: null,
    })
    const builder = {
      insert: (row: Record<string, unknown>) => {
        calls.method = 'insert'; calls.row = row
        return { select: () => ({ single }) }
      },
      upsert: (row: Record<string, unknown>) => {
        calls.method = 'upsert'; calls.row = row
        return { select: () => ({ single }) }
      },
    }
    supabaseMock.from = () => builder
    const { saveVenue } = await import('./venues')
    await saveVenue(input)
    return { calls }
  }

  it('inserts rather than upserts, so it cannot become a second update path', async () => {
    const { calls } = await runSaveVenue({ name: 'Tela Park', courts: 8 })
    expect(calls.method).toBe('insert')
  })

  it('sends no updated_at, because the trigger owns it and a client value would be a lie', async () => {
    const { calls } = await runSaveVenue({ name: 'Tela Park', courts: 8 })
    expect(calls.row).not.toHaveProperty('updated_at')
  })

  it('sends no id, because a venue being created does not have one yet', async () => {
    const { calls } = await runSaveVenue({ name: 'Tela Park', courts: 8 })
    expect(calls.row).not.toHaveProperty('id')
  })
})
