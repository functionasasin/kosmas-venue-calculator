import { describe, it, expect } from 'vitest'
import type { Venue } from '@/data/venues'
import type { StoredLine } from '@/data/venueLines'
import { venueSnapshot } from './venueSnapshot'

const venue: Venue = {
  id: 'v1', name: 'Tela Park', courts: 14, tier: 'pro',
  securityCameras: 0, kisiDoors: 0, extendedRetention: false,
  backupInternet: false,
  updatedAt: '2026-09-01T10:00:00.123456+00:00',
  createdByEmail: 'a@kosmas.ph', updatedByEmail: 'a@kosmas.ph',
}

const line = (over: Partial<StoredLine> = {}): StoredLine => ({
  id: 'l1', venueId: 'v1', itemId: 'uni', roleKey: 'replay_camera', qty: 14,
  originRoleKey: null, sortOrder: 0, source: 'formula',
  suppressed: false, note: null, ...over,
})

describe('venueSnapshot', () => {
  // The audit stamps are written by the server on every save. Comparing them
  // would report a venue nobody touched as dirty, and a guard that always fires
  // is one people learn to click through.
  it('ignores the audit stamps the server rewrites on every save', () => {
    const after: Venue = {
      ...venue,
      updatedAt: '2026-09-02T11:30:00.654321+00:00',
      updatedByEmail: 'b@kosmas.ph',
    }
    expect(venueSnapshot(after, [line()], []))
      .toBe(venueSnapshot(venue, [line()], []))
  })

  // mergeRecalculation mints `new:${roleKey}` ids with an empty venueId that
  // can never equal what the RPC returns, so comparing them would report every
  // recalculated venue as dirty forever.
  it('ignores line ids and venue ids', () => {
    const minted = line({ id: 'new:replay_camera', venueId: '' })
    expect(venueSnapshot(venue, [minted], []))
      .toBe(venueSnapshot(venue, [line()], []))
  })

  // The choice set is built from a Set iteration, so its order is incidental.
  // A reordering that changes nothing must not read as an edit.
  it('ignores the order of the choice set', () => {
    const a = [{ roleKey: 'replay_camera' as const, itemId: 'uni' },
               { roleKey: 'ipad' as const, itemId: 'pad' }]
    expect(venueSnapshot(venue, [], [...a].reverse()))
      .toBe(venueSnapshot(venue, [], a))
  })

  // Without this the three tests above would pass on a function that returned a
  // constant. Each of the three things a save actually writes must move it.
  it('changes for an edit to the inputs, a line, or a choice', () => {
    const base = venueSnapshot(venue, [line()], [])
    expect(venueSnapshot({ ...venue, courts: 8 }, [line()], []))
      .not.toBe(base)
    expect(venueSnapshot(venue, [line({ qty: 12 })], []))
      .not.toBe(base)
    expect(venueSnapshot(venue, [line()],
      [{ roleKey: 'replay_camera', itemId: 'dah' }])).not.toBe(base)
  })

  // A venue that has not loaded yet is a real state, and the snapshot effect
  // reads it before the guard arms.
  it('handles a venue that has not loaded', () => {
    expect(() => venueSnapshot(null, [], [])).not.toThrow()
  })
})
