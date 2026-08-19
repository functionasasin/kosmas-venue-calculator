import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { Item } from '@/calculator/types'
import type { StoredLine } from '@/data/venueLines'
import { testCatalog } from '@/calculator/testCatalog'

const venue = {
  id: 'v1', name: 'Tela Park', courts: 8, tier: 'pro' as const,
  securityCameras: 0, kisiDoors: 0 as const,
  extendedRetention: false, backupInternet: false,
  updatedAt: '2026-08-19T07:58:00.123456+00:00',
  createdByEmail: 'a@b.c', updatedByEmail: 'a@b.c',
}

// A venue that has already been saved: lines exist, so the old
// `lines.length === 0` guard would skip the calculation entirely.
const savedLines: StoredLine[] = [{
  id: 'l1', venueId: 'v1', itemId: 'ups', roleKey: 'ups', qty: 1,
  originRoleKey: null, sortOrder: 0, source: 'formula',
  suppressed: false, note: null,
}]

vi.mock('@/data/venues', () => ({
  getVenue: vi.fn(async () => venue),
  saveVenue: vi.fn(async (v: unknown) => v),
}))
vi.mock('@/data/items', () => ({
  listItems: vi.fn(async (): Promise<Item[]> => testCatalog),
}))
vi.mock('@/data/venueLines', async () => {
  const real = await vi.importActual<typeof import('@/data/venueLines')>(
    '@/data/venueLines',
  )
  return {
    ...real,
    listLines: vi.fn(async () => savedLines),
    saveVenueAndLines: vi.fn(async (v: unknown, l: unknown) => ({ venue: v, lines: l })),
  }
})
vi.mock('@/auth/useRole', () => ({ useRole: () => 'admin' }))

// Top-level, not just inside the describe below: without it the mocks
// accumulate calls across the file's top-level tests, so any assertion on a
// call COUNT silently measures every earlier test too.
beforeEach(() => vi.clearAllMocks())

const renderDetail = async () => {
  const { VenueDetail } = await import('./VenueDetail')
  render(
    <MemoryRouter initialEntries={['/venues/v1']}>
      <Routes>
        <Route path="/venues/:id" element={<VenueDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('a venue that already has saved lines', () => {
  beforeEach(() => vi.clearAllMocks())

  // The old code only calculated when lines were empty, so every saved venue
  // showed no checks at all until the user pressed Recalculate. With warnings
  // in a permanent rail that is a blank panel on every real venue.
  it('shows its checks on load without pressing Recalculate', async () => {
    await renderDetail()
    expect(await screen.findByText(/Access point count is not derivable/i))
      .toBeInTheDocument()
  })

  it('shows the PoE budget check on load', async () => {
    await renderDetail()
    expect(await screen.findByText(/PoE load/i)).toBeInTheDocument()
  })
})

it('carries the Kosmas lockup in the rail header', async () => {
  await renderDetail()
  expect(await screen.findByRole('img', { name: 'Kosmas' })).toBeInTheDocument()
})

it('offers the theme toggle from the toolbar', async () => {
  await renderDetail()
  expect(await screen.findByRole('button', { name: /switch to .* theme/i })).toBeInTheDocument()
})

// Same rule as Venues and Catalog: the toggle leads the action cluster. Here
// three buttons trail it, so it sits further from the window edge than on
// Catalog — that is the trailing count, not a different placement.
it('puts the theme toggle first in the toolbar', async () => {
  await renderDetail()
  const toggle = await screen.findByRole('button', { name: /switch to .* theme/i })
  expect(toggle.parentElement?.firstElementChild).toBe(toggle)
})

// A conflict must not be reported as a generic failure: the two ways out both
// destroy someone's work, so the dialog has to say whose before offering them.
it('names who saved when the optimistic lock rejects the save', async () => {
  const { saveVenueAndLines, VenueConflictError } = await import('@/data/venueLines')
  vi.mocked(saveVenueAndLines).mockRejectedValueOnce(
    new VenueConflictError('other@kosmas.com', '2026-08-19T09:00:00.000001+00:00'),
  )
  await renderDetail()
  fireEvent.click(await screen.findByRole('button', { name: 'Save' }))
  expect(await screen.findByText(/other@kosmas\.com/)).toBeInTheDocument()
})

// Raising on an unresolvable line stops the silent drop, but on its own it
// makes the venue permanently unsavable — the realistic cause is an admin
// deactivating the only item for a role, and the `user` account has no catalog
// access to undo that. The dialog is the way out.
it('offers to remove lines that point at no item, rather than dead-ending', async () => {
  const { saveVenueAndLines, UnresolvedLinesError } = await import('@/data/venueLines')
  vi.mocked(saveVenueAndLines).mockRejectedValueOnce(
    new UnresolvedLinesError([{
      id: 'x', venueId: 'v1', itemId: '', roleKey: 'flic', qty: 4,
      originRoleKey: null, sortOrder: 0, source: 'formula',
      suppressed: false, note: null,
    }]),
  )
  await renderDetail()
  fireEvent.click(await screen.findByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('button', { name: /remove these lines and save/i }))
    .toBeInTheDocument()
})

// "Overwrite theirs" must actually overwrite. The first version set the baseline
// and closed the dialog WITHOUT re-issuing, so the button saved neither version
// and said nothing. Calling save() there would not have fixed it either: setVenue
// is asynchronous, so the retry would have re-sent the stale baseline and
// conflicted again — the button appearing to do nothing, twice.
it('re-issues the save against the new baseline when overwriting a conflict', async () => {
  const { saveVenueAndLines, VenueConflictError } = await import('@/data/venueLines')
  vi.mocked(saveVenueAndLines).mockRejectedValueOnce(
    new VenueConflictError('other@kosmas.com', '2026-08-19T09:00:00.000001+00:00'),
  )
  await renderDetail()
  fireEvent.click(await screen.findByRole('button', { name: 'Save' }))
  fireEvent.click(await screen.findByRole('button', { name: /overwrite theirs/i }))

  await waitFor(() => expect(saveVenueAndLines).toHaveBeenCalledTimes(2))
  expect(vi.mocked(saveVenueAndLines).mock.calls[1][0].updatedAt)
    .toBe('2026-08-19T09:00:00.000001+00:00')
})
