import { describe, it, expect, vi } from 'vitest'

// venues.ts pulls in the real client at import time, which throws without the
// VITE_ env vars. Nothing here touches the network — only the pure coercion.
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

const { readTier } = await import('./venues')

describe('readTier', () => {
  // tiers-reference.md § Basic is retired (2026-08-10): "If you find 'Basic' in
  // an older deck, spreadsheet field, or quote, read it as Basic+." Pro+ was
  // folded into Pro the same day.
  it('reads retired tiers as their replacements, because the tier column is plain text and rows predating the change still hold them', () => {
    expect(readTier('basic')).toBe('basic_plus')
    expect(readTier('pro_plus')).toBe('pro')
  })

  // The failure this guards is silent, which is why it is worth a test: an
  // uncoerced 'basic' makes the tier <select> render a value matching no
  // option, so the form displays basic_plus as current while the database
  // still says basic — and the mismatch only surfaces on the next save.
  it('leaves every live tier untouched, so the coercion cannot mask a real value', () => {
    for (const t of ['basic_plus', 'pro', 'autonomous', 'autonomous_plus'] as const) {
      expect(readTier(t)).toBe(t)
    }
  })
})
