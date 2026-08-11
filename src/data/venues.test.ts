import { describe, it, expect, vi } from 'vitest'

// venues.ts pulls in the real client at import time, which throws without the
// VITE_ env vars. Nothing here touches the network — only the pure coercion.
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

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
