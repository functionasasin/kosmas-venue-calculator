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
        {/* A DISTINCT sentinel, not VenueDetail again. Leaving has to be
            observable: these tests assert the guard by whether navigation
            actually happened, and "no dialog rendered" would pass just as well
            if the guard were broken and the screen had remounted. */}
        <Route path="/" element={<div>venue list</div>} />
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

  /**
   * The saved-by line spent its first life inside the brand band, where
   * --muted-foreground sat on navy --railhd at 1.46:1 and was effectively
   * invisible. It reads as a natural home — it is venue identity, and the venue
   * name is right there — so the pull to put it back is real.
   *
   * This asserts the ground, not the wording: the text must exist somewhere on
   * the screen, and must NOT be inside the element carrying bg-railhd.
   */
  it('keeps the saved-by line off the band whose grey it cannot use', async () => {
    await renderDetail()
    const saved = await screen.findByText(/Saved by/)
    expect(saved.closest('.bg-railhd')).toBeNull()
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

// The single most likely daily loss: everything on this screen lives in React
// state and Save is the only write path, so leaving discards edits with no
// prompt and no marker.
it('warns before leaving with unsaved edits, and does NOT navigate', async () => {
  await renderDetail()
  const courts = await screen.findByLabelText(/courts/i)
  fireEvent.change(courts, { target: { value: '12' } })
  fireEvent.click(screen.getByRole('link', { name: /all venues/i }))
  expect(await screen.findByText(/you have unsaved changes/i)).toBeInTheDocument()
  // The half that matters: the click was actually blocked, not merely
  // accompanied by a dialog on a screen that is already leaving.
  expect(screen.queryByText('venue list')).not.toBeInTheDocument()
})

// The auto-populate effect fills lines whenever a venue has none, and Venues
// creates a venue with no lines then navigates straight to it. Snapshotting at
// load would capture lines: [], the effect would immediately fill them, and
// the guard would fire on a venue nobody has touched.
it('does not warn on a freshly created venue nobody has edited', async () => {
  await renderDetail()
  // Wait for the calculation, so the auto-populate effect has definitely run —
  // otherwise this passes for the wrong reason (nothing loaded yet).
  await screen.findByText(/Access point count is not derivable/i)
  fireEvent.click(screen.getByRole('link', { name: /all venues/i }))
  expect(await screen.findByText('venue list')).toBeInTheDocument()
})

// A guard that never clears is a guard people learn to click through: if the
// snapshot is not replaced on save, every subsequent exit warns about edits
// that are already persisted.
it('stops warning once saved', async () => {
  const { saveVenueAndLines } = await import('@/data/venueLines')
  await renderDetail()
  const courts = await screen.findByLabelText(/courts/i)
  fireEvent.change(courts, { target: { value: '12' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  // NOT `findByText('Saved')` — the Toaster is mounted in App.tsx, outside
  // VenueDetail's tree, so the toast never renders in this test.
  await waitFor(() => expect(saveVenueAndLines).toHaveBeenCalled())

  fireEvent.click(screen.getByRole('link', { name: /all venues/i }))
  expect(await screen.findByText('venue list')).toBeInTheDocument()
})

// The other half, as its own test: after a save the snapshot must track the
// NEW state, so a fresh edit is dirty again. Split from the above because each
// ends in a navigation, and a test that continues past one is asserting
// against a torn-down tree.
it('warns again on an edit made after a save', async () => {
  const { saveVenueAndLines } = await import('@/data/venueLines')
  await renderDetail()
  const courts = await screen.findByLabelText(/courts/i)
  fireEvent.change(courts, { target: { value: '12' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(saveVenueAndLines).toHaveBeenCalled())

  fireEvent.change(await screen.findByLabelText(/courts/i), { target: { value: '14' } })
  fireEvent.click(screen.getByRole('link', { name: /all venues/i }))
  expect(await screen.findByText(/you have unsaved changes/i)).toBeInTheDocument()
})

// The destructive branch has to be the one the user picks on purpose. Cancel
// must return them to their edits intact — a "safe" button that quietly drops
// work is worse than no dialog at all.
it('keeps the edit on Cancel', async () => {
  await renderDetail()
  const courts = await screen.findByLabelText(/courts/i)
  fireEvent.change(courts, { target: { value: '12' } })

  fireEvent.click(screen.getByRole('link', { name: /all venues/i }))
  fireEvent.click(await screen.findByRole('button', { name: /^cancel$/i }))
  expect(await screen.findByLabelText(/courts/i)).toHaveValue(12)
  expect(screen.queryByText('venue list')).not.toBeInTheDocument()
})

it('leaves without saving on Discard', async () => {
  const { saveVenueAndLines } = await import('@/data/venueLines')
  await renderDetail()
  fireEvent.change(await screen.findByLabelText(/courts/i), { target: { value: '12' } })

  fireEvent.click(screen.getByRole('link', { name: /all venues/i }))
  fireEvent.click(await screen.findByRole('button', { name: /discard and leave/i }))
  expect(await screen.findByText('venue list')).toBeInTheDocument()
  expect(saveVenueAndLines).not.toHaveBeenCalled()
})

// With two accounts "who" is nearly a coin flip, but "when was this last
// touched" is not — and it is the only thing on screen that distinguishes a
// venue someone else has been editing from one nobody has opened in a month.
//
// The address is asserted through the title because the visible line shows the
// local part alone; dropping the domain is only safe while the whole address
// stays recoverable, so the two assertions belong together.
it('shows who last saved the venue and when, in the rail', async () => {
  await renderDetail()
  expect(await screen.findByTitle(/last saved by a@b\.c/i)).toBeInTheDocument()
  expect(screen.getByText(/Aug 19, 2026/)).toBeInTheDocument()
})

// "Save and leave" must not leave when the save did not happen. `save` catches
// every failure and returns undefined, so navigating unconditionally unmounts
// the screen before the conflict dialog can render — losing exactly the edits
// this whole guard exists to protect, on the one path the user chose in order
// to keep them.
it('stays put when Save and leave fails', async () => {
  const { saveVenueAndLines, VenueConflictError } = await import('@/data/venueLines')
  vi.mocked(saveVenueAndLines).mockRejectedValueOnce(
    new VenueConflictError('other@kosmas.com', '2026-08-19T09:00:00.000001+00:00'),
  )
  await renderDetail()
  fireEvent.change(await screen.findByLabelText(/courts/i), { target: { value: '12' } })
  fireEvent.click(screen.getByRole('link', { name: /all venues/i }))
  fireEvent.click(await screen.findByRole('button', { name: /save and leave/i }))

  // The conflict must be visible, and we must still be on the venue.
  expect(await screen.findByText(/other@kosmas\.com/)).toBeInTheDocument()
  expect(screen.queryByText('venue list')).not.toBeInTheDocument()
})

// calculateBOM returns { lines: [] } for a blocked tier (index.ts:22) and for
// PORT_CEILING (:30), while `result` is non-null. The snapshot effect required
// `lines.length > 0 || result === null`, so on those venues it never fired and
// `dirty` was permanently false — no dialog, no beforeunload.
//
// Opening a Basic venue to upgrade it is the realistic case, and it is the one
// where the guard silently did nothing.
it('guards a venue whose tier produces no lines at all', async () => {
  const { getVenue } = await import('@/data/venues')
  const { listLines } = await import('@/data/venueLines')
  vi.mocked(getVenue).mockResolvedValueOnce({ ...venue, tier: 'basic' })
  // A blocked tier sizes nothing, so such a venue has no saved lines either —
  // the file's default listLines mock returns one, which masks the bug.
  vi.mocked(listLines).mockResolvedValueOnce([])
  await renderDetail()
  // Blocked tiers size nothing, so wait on the block message rather than a line.
  await screen.findByText(/booking website/i)
  fireEvent.change(await screen.findByLabelText(/courts/i), { target: { value: '12' } })
  fireEvent.click(screen.getByRole('link', { name: /all venues/i }))
  expect(await screen.findByText(/you have unsaved changes/i)).toBeInTheDocument()
})
