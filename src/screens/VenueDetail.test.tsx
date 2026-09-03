import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
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
  id: 'l1', venueId: 'v1', itemId: 'ups_1500va', roleKey: 'ups_1500va', qty: 1,
  originRoleKey: null, sortOrder: 0, source: 'formula',
  suppressed: false, note: null,
}]

// One mock for every storage call, matching the screen's one storage import.
// The error classes are NOT mocked — they come from the real venueLines, which
// re-exports venueTypes', so `instanceof` in the screen still matches what the
// tests throw. Mocking them here would silently disable both recovery dialogs
// and the tests below would then be asserting on a toast.
vi.mock('@/data/venueStore', () => ({
  getVenue: vi.fn(async () => venue),
  listLines: vi.fn(async () => savedLines),
  listChoices: vi.fn(async () => []),
  saveVenueAndLines: vi.fn(
    async (v: unknown, l: unknown, _catalog: unknown, ch: unknown) =>
      ({ venue: v, lines: l, choices: ch ?? [] }),
  ),
  // Read by the session-loss watch and by SaveStatus's `local` prop. NOT by the
  // conflict dialog — that reads VenueConflictError.local, so no screen has to
  // ask where a venue lives just to word a sentence.
  isLocalVenueId: vi.fn(() => false),
}))
vi.mock('@/data/items', () => ({
  listItems: vi.fn(async (): Promise<Item[]> => testCatalog),
}))
// venueLines still loads for real (mergeRecalculation and the two error
// classes), and it imports the client at module load, which throws without the
// VITE_ env vars. No call below reaches it.
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
// The exporter is FETCHED ON THE CLICK now — jsPDF, jspdf-autotable and the
// base64 letterhead are ~474 kB that only this button reaches. Mocked here so
// the tests below can drive both ends of that dynamic import; vi.mock
// intercepts a dynamic import the same as a static one.
vi.mock('@/pdf/exportMaterials', () => ({ exportMaterialsPdf: vi.fn() }))
// Only the export path asserts on a toast, and only because the fetch above is
// the one failure on this screen with no dialog of its own. `Toaster` is here
// because ui/sonner re-exports it; nothing in this tree renders it.
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}))
vi.mock('@/auth/useRole', () => ({ useRole: () => 'admin' }))
// Drivable, so a test can end the session mid-screen. Nothing on VenueDetail
// reacted to it before, because App unmounted the whole tree on sign-out.
const session = { current: { user: { id: 'u1' } } as unknown }
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ session: session.current }) }))

// Top-level, not just inside the describe below: without it the mocks
// accumulate calls across the file's top-level tests, so any assertion on a
// call COUNT silently measures every earlier test too.
beforeEach(() => vi.clearAllMocks())

// clearAllMocks clears CALL HISTORY, not implementations, so a
// mockReturnValue(true) set in one test would leak into every test after it —
// and tests below assert opposite things about this one. Reset both here so no
// case can pass by inheriting its neighbour's setup.
beforeEach(async () => {
  session.current = { user: { id: 'u1' } }
  const storeMod = await import('@/data/venueStore')
  vi.mocked(storeMod.isLocalVenueId).mockReturnValue(false)
})

// Returns the render result so a test that needs a second render in the same
// body (comparing two catalog states) can unmount the first cleanly rather
// than leaving two trees mounted at once.
const renderDetail = async () => {
  const { VenueDetail } = await import('./VenueDetail')
  return render(
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

// Re-renders the SAME tree so the component sees a changed session without
// remounting. A fresh render() would run the loader again and hide the very
// transition under test. initialEntries is initial-only and React reconciles
// VenueDetail by type, so its state survives — which is the whole point.
const rerenderDetail = async (rerender: (ui: React.ReactElement) => void) => {
  const { VenueDetail } = await import('./VenueDetail')
  rerender(
    <MemoryRouter initialEntries={['/venues/v1']}>
      <Routes>
        <Route path="/venues/:id" element={<VenueDetail />} />
        {/* The SAME sentinel renderDetail uses. A second, different one would
            make two helpers disagree about what "left the screen" looks like. */}
        <Route path="/" element={<div>venue list</div>} />
      </Routes>
    </MemoryRouter>,
  )
  await waitFor(() => {})
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
//
// Asserted against the CONTROLS, not the first child. The save status is a
// static label sharing the bar and it sits ahead of the toggle in the DOM, so
// that a justify-end row leaves it leftmost — beside Save, which is the button
// that clears it. It takes no part in the ordering rule because it is not a
// control; the rule is about which control comes first.
it('puts the theme toggle first among the toolbar controls', async () => {
  await renderDetail()
  const toggle = await screen.findByRole('button', { name: /switch to .* theme/i })
  const controls = [...toggle.parentElement!.querySelectorAll('button')]
  expect(controls[0]).toBe(toggle)
})

// A conflict must not be reported as a generic failure: the two ways out both
// destroy someone's work, so the dialog has to say whose before offering them.
it('names who saved when the optimistic lock rejects the save', async () => {
  const { saveVenueAndLines } = await import('@/data/venueStore')
  const { VenueConflictError } = await import('@/data/venueLines')
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
  const { saveVenueAndLines } = await import('@/data/venueStore')
  const { UnresolvedLinesError } = await import('@/data/venueLines')
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

// The list in that dialog is what the user reads to decide whether dropping
// these lines is acceptable, and `flic: 4` does not tell them a Flic button is
// about to leave the venue. diffLines already speaks ROLE_LABELS in the
// recalculate and stale dialogs; this was the one surface left printing the
// engine's internal key at a person.
it('names the roles in that dialog rather than printing role keys', async () => {
  const { saveVenueAndLines } = await import('@/data/venueStore')
  const { UnresolvedLinesError } = await import('@/data/venueLines')
  vi.mocked(saveVenueAndLines).mockRejectedValueOnce(
    new UnresolvedLinesError([{
      id: 'x', venueId: 'v1', itemId: '', roleKey: 'ipad_poe_adapter', qty: 8,
      originRoleKey: null, sortOrder: 0, source: 'formula',
      suppressed: false, note: null,
    }]),
  )
  await renderDetail()
  fireEvent.click(await screen.findByRole('button', { name: 'Save' }))

  // Scoped to the dialog: MaterialsTable's add-line picker lists raw role keys
  // in its <option>s, which is a different surface and legitimately so.
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByText(/iPad PoE adapter: 8/)).toBeInTheDocument()
  expect(within(dialog).queryByText(/ipad_poe_adapter/)).toBeNull()
})

// A manual line carries roleKey null AND, being unresolved, has no item to name
// either — so there is no lookup that would produce a better string. It must
// still not read as a missing value.
it('calls an unresolved manual line a manual line, not an unknown role', async () => {
  const { saveVenueAndLines } = await import('@/data/venueStore')
  const { UnresolvedLinesError } = await import('@/data/venueLines')
  vi.mocked(saveVenueAndLines).mockRejectedValueOnce(
    new UnresolvedLinesError([{
      id: 'x', venueId: 'v1', itemId: '', roleKey: null, qty: 2,
      originRoleKey: null, sortOrder: 0, source: 'manual',
      suppressed: false, note: null,
    }]),
  )
  await renderDetail()
  fireEvent.click(await screen.findByRole('button', { name: 'Save' }))

  expect(await screen.findByText(/Manual line: 2/)).toBeInTheDocument()
})

// "Overwrite theirs" must actually overwrite. The first version set the baseline
// and closed the dialog WITHOUT re-issuing, so the button saved neither version
// and said nothing. Calling save() there would not have fixed it either: setVenue
// is asynchronous, so the retry would have re-sent the stale baseline and
// conflicted again — the button appearing to do nothing, twice.
it('re-issues the save against the new baseline when overwriting a conflict', async () => {
  const { saveVenueAndLines } = await import('@/data/venueStore')
  const { VenueConflictError } = await import('@/data/venueLines')
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
  const { saveVenueAndLines } = await import('@/data/venueStore')
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
  const { saveVenueAndLines } = await import('@/data/venueStore')
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
  const { saveVenueAndLines } = await import('@/data/venueStore')
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
  const { saveVenueAndLines } = await import('@/data/venueStore')
  const { VenueConflictError } = await import('@/data/venueLines')
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
  const { getVenue } = await import('@/data/venueStore')
  const { listLines } = await import('@/data/venueStore')
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

describe('per-venue hardware choice', () => {
  const uniview = { ...testCatalog.find(i => i.roleKey === 'replay_camera')!,
    poeWatts: 2.8, isDefault: true }
  const dahua = { ...uniview, id: 'dah', name: 'Dahua 5459T',
    poeWatts: 17.5, isDefault: false }
  const twoCameras = [
    ...testCatalog.filter(i => i.roleKey !== 'replay_camera'), uniview, dahua,
  ]

  // Criterion 2, first half. A 14-court Pro venue is 1000 VA on the Uniview
  // and 1500 VA on the Dahua; if the picker stops moving the rung, this fails.
  it('sizes the venue against the chosen camera', async () => {
    const { getVenue } = await import('@/data/venueStore')
    const { listItems } = await import('@/data/items')
    const { listLines } = await import('@/data/venueStore')
    const { listChoices } = await import('@/data/venueStore')

    vi.mocked(getVenue).mockResolvedValueOnce({ ...venue, courts: 14 })
    vi.mocked(listItems).mockResolvedValueOnce(twoCameras)
    // No stored lines: the auto-populate effect fills them from the freshly
    // calculated result, which is what actually exercises the sizing.
    vi.mocked(listLines).mockResolvedValueOnce([])
    vi.mocked(listChoices).mockResolvedValueOnce(
      [{ roleKey: 'replay_camera', itemId: 'dah' }],
    )
    const first = await renderDetail()
    expect(await screen.findByText('ups_1500va',
      { selector: '[data-slot="select-value"]' })).toBeInTheDocument()
    // Unmount before rendering a second copy of the screen, or both trees
    // stay mounted at once and the second assertion's query is ambiguous.
    first.unmount()

    vi.mocked(getVenue).mockResolvedValueOnce({ ...venue, courts: 14 })
    vi.mocked(listItems).mockResolvedValueOnce(twoCameras)
    vi.mocked(listLines).mockResolvedValueOnce([])
    // listChoices is left at the file's default (resolves to []), so the role
    // falls back to the catalog default — the Uniview.
    await renderDetail()
    expect(await screen.findByText('ups_1000va',
      { selector: '[data-slot="select-value"]' })).toBeInTheDocument()
  })

  // Criterion 2, second half, and the trap §5 exists for: the sizing can move
  // while the SAVED item and the PDF keep the old camera. The venue must start
  // with a STORED replay_camera line carrying the Uniview's itemId, or the
  // assertion proves nothing about the merge — a freshly minted line would
  // carry the right id either way.
  it('saves the chosen camera as the line\'s item_id', async () => {
    const { listItems } = await import('@/data/items')
    const { listLines, saveVenueAndLines } = await import('@/data/venueStore')
    const { listChoices } = await import('@/data/venueStore')

    vi.mocked(listItems).mockResolvedValueOnce(twoCameras)
    vi.mocked(listLines).mockResolvedValueOnce([{
      id: 'l-cam', venueId: 'v1', itemId: uniview.id, roleKey: 'replay_camera',
      qty: 8, originRoleKey: null, sortOrder: 0, source: 'formula',
      suppressed: false, note: null,
    }])
    vi.mocked(listChoices).mockResolvedValueOnce(
      [{ roleKey: 'replay_camera', itemId: 'dah' }],
    )

    await renderDetail()
    // Recalculate -> Apply -> Save.
    fireEvent.click(await screen.findByRole('button', { name: /recalculate/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'Apply' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saveVenueAndLines).toHaveBeenCalled())

    const savedLines = vi.mocked(saveVenueAndLines).mock.calls[0][1]
    expect(savedLines.find(l => l.roleKey === 'replay_camera')!.itemId)
      .toBe('dah')
  })

  // The full set every save, derived from the resolution — so a venue that has
  // never chosen still pins its default the first time it is saved, and a
  // later default flip cannot move it.
  it('sends a choice for every multi-option role, even when the venue never picked', async () => {
    const { listItems } = await import('@/data/items')
    const { saveVenueAndLines } = await import('@/data/venueStore')

    vi.mocked(listItems).mockResolvedValueOnce(twoCameras)
    // listChoices is left at the file's default (resolves to []).

    await renderDetail()
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saveVenueAndLines).toHaveBeenCalled())

    expect(vi.mocked(saveVenueAndLines).mock.calls[0][3])
      .toEqual([{ roleKey: 'replay_camera', itemId: uniview.id }])
  })

  // A stored pin is user data. Deactivating the alternate stops the role being
  // contested, and a set derived from "currently >1 active" would omit it — so
  // the next save of that venue, for any unrelated reason, would delete it.
  // Reactivating the alternate later would then silently follow the default.
  it('keeps a stored choice after the alternate is deactivated', async () => {
    const { listItems } = await import('@/data/items')
    const { saveVenueAndLines } = await import('@/data/venueStore')
    const { listChoices } = await import('@/data/venueStore')

    vi.mocked(listItems).mockResolvedValueOnce(
      [uniview, { ...dahua, isActive: false }],
    )
    vi.mocked(listChoices).mockResolvedValueOnce(
      [{ roleKey: 'replay_camera', itemId: uniview.id }],
    )

    await renderDetail()
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saveVenueAndLines).toHaveBeenCalled())

    expect(vi.mocked(saveVenueAndLines).mock.calls[0][3])
      .toEqual([{ roleKey: 'replay_camera', itemId: uniview.id }])
  })

  // The complementary case to the test above: here it is the venue's OWN
  // pick, not the alternate, that gets deactivated. `resolved.chosen` holds
  // the fallback (the Uniview) in that state, and if choicesToSave ever
  // preferred the resolution over the stored id again, this would save the
  // fallback and silently delete the venue's pin on the next unrelated save.
  it('keeps a stored choice after the chosen item itself is deactivated', async () => {
    const { listItems } = await import('@/data/items')
    const { saveVenueAndLines } = await import('@/data/venueStore')
    const { listChoices } = await import('@/data/venueStore')

    vi.mocked(listItems).mockResolvedValueOnce(
      [uniview, { ...dahua, isActive: false }],
    )
    vi.mocked(listChoices).mockResolvedValueOnce(
      [{ roleKey: 'replay_camera', itemId: dahua.id }],
    )

    await renderDetail()
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saveVenueAndLines).toHaveBeenCalled())

    expect(vi.mocked(saveVenueAndLines).mock.calls[0][3])
      .toEqual([{ roleKey: 'replay_camera', itemId: dahua.id }])
  })

  // projection() serialises { venue, lines }. A choice change touches neither,
  // so without a choices term `dirty` stays false, the unsaved-changes guard
  // never arms, and the edit is lost on navigate — silently, which is what
  // 7030054 and 4223ab3 were about.
  it('marks the venue dirty when a picker changes', async () => {
    const { listItems } = await import('@/data/items')
    const { listLines } = await import('@/data/venueStore')
    vi.mocked(listItems).mockResolvedValueOnce(twoCameras)
    // The file's default saved venue is one UPS line, so the table would hold
    // no camera row to pick from. An empty venue populates from the formulas.
    vi.mocked(listLines).mockResolvedValueOnce([])
    await renderDetail()

    // The materials row's swap control — the only hardware picker left since
    // 2026-08-25, and the one whose same-role swap writes the venue's choice.
    // A rail group used to make the same call from the sidebar.
    // Named for the item the row currently holds — the fixture's replay camera
    // carries its role key as its name — because several rows have a picker.
    const trigger = await screen.findByRole(
      'combobox', { name: `Swap item for ${uniview.name}` },
    )
    fireEvent.click(trigger)
    const popup = document.querySelector('[data-slot="select-content"]')
    if (!popup) throw new Error('swap picker did not open')
    const option = within(popup as HTMLElement).getByRole('option', { name: 'Dahua 5459T' })
    fireEvent.mouseMove(option)
    fireEvent.click(option)

    // Both SaveStatus (desktop) and UnsavedStrip (mobile) render in jsdom at
    // once, since the responsive hiding is CSS the test environment does not
    // apply — hence AllBy rather than a single match.
    expect((await screen.findAllByText('Unsaved changes')).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('link', { name: /all venues/i }))
    expect(await screen.findByText(/you have unsaved changes/i)).toBeInTheDocument()
    expect(screen.queryByText('venue list')).not.toBeInTheDocument()
  })

  // A deactivated part must not be specced onto a fresh BOM, and substituting
  // silently is the failure this feature exists to remove.
  it('warns when the venue\'s chosen item was deactivated', async () => {
    const { listItems } = await import('@/data/items')
    const { listChoices } = await import('@/data/venueStore')

    vi.mocked(listItems).mockResolvedValueOnce(
      [uniview, { ...dahua, isActive: false }],
    )
    vi.mocked(listChoices).mockResolvedValueOnce(
      [{ roleKey: 'replay_camera', itemId: 'dah' }],
    )

    await renderDetail()
    // WarningsPanel shows two checks and folds the rest away, and this venue
    // emits more than two, so the panel has to be opened before the warning
    // can be read. It sorts by level and CHOICE_UNAVAILABLE is a `warn`, so
    // there is no rank that would carry it into the visible pair.
    fireEvent.click(await screen.findByRole('button', { name: /show \d+ more/i }))
    // Not /Dahua 5459T/: that name also renders in the materials row's swap
    // picker as the inactive fallback, so it is on screen whether or not the
    // warning ever fires. The warning's own wording is what CHOICE_UNAVAILABLE
    // alone produces.
    expect(await screen.findByText(/deactivated or no longer fills that role/))
      .toBeInTheDocument()
  })

  // §5: mergeRecalculation leaves manual lines alone, deliberately, so a
  // hand-edited line can keep naming an item the venue is no longer sized on —
  // the rung, the ports and the PoE budget all read the resolved catalog, never
  // the lines. The consequence has to be stated on the screen rather than
  // discovered on the printed sheet. A same-role swap writes the choice now, so
  // what reaches this state is a line swapped before that delegation existed.
  it('warns when a hand-edited line names an item the venue is not sized on', async () => {
    const { listItems } = await import('@/data/items')
    const { listLines } = await import('@/data/venueStore')

    vi.mocked(listItems).mockResolvedValueOnce(twoCameras)
    vi.mocked(listLines).mockResolvedValueOnce([{
      id: 'l-cam', venueId: 'v1', itemId: dahua.id, roleKey: 'replay_camera',
      qty: 8, originRoleKey: null, sortOrder: 0, source: 'manual',
      suppressed: false, note: null,
    }])

    await renderDetail()
    // The venue has no stored pin, so it is sized on the role default — the
    // Uniview, which the fixture names for its role key — while the line names
    // the Dahua.
    const said = await screen.findByText(/edited by hand/i)
    expect(said.textContent).toContain(dahua.name)
    expect(said.textContent).toContain(uniview.name)
  })

  // The other side of that line, and the one the old wording got wrong: a
  // hand-edited line whose item AGREES with what the venue is sized on has
  // nothing to report. It froze its quantity, which this warning is not about,
  // and firing anyway put a permanent warning on every venue that had ever
  // corrected a count.
  it('says nothing when a hand-edited line names the item it is sized on', async () => {
    const { listItems } = await import('@/data/items')
    const { listLines } = await import('@/data/venueStore')

    vi.mocked(listItems).mockResolvedValueOnce(twoCameras)
    vi.mocked(listLines).mockResolvedValueOnce([{
      id: 'l-cam', venueId: 'v1', itemId: uniview.id, roleKey: 'replay_camera',
      qty: 6, originRoleKey: null, sortOrder: 0, source: 'manual',
      suppressed: false, note: null,
    }])

    await renderDetail()
    await screen.findByRole('button', { name: 'Save' })
    expect(screen.queryByText(/edited by hand/i)).not.toBeInTheDocument()
  })

  // The warning compares against what the venue is SIZED on, which is
  // resolved.chosen — not the entry in choicesToSave, which deliberately
  // carries the STORED pin so a save cannot overwrite it. The two disagree
  // exactly here: the pin is deactivated, so the venue is sized on the fallback
  // while the stored id still names the dead item. Comparing against the pin
  // reported a drift between two items the venue is not sized on either way,
  // in the one state where the user is already being told their pick is gone.
  it('says nothing when a hand-edited line names the fallback its dead pin resolved to', async () => {
    const { listItems } = await import('@/data/items')
    const { listLines } = await import('@/data/venueStore')
    const { listChoices } = await import('@/data/venueStore')

    vi.mocked(listItems).mockResolvedValueOnce(
      [...testCatalog.filter(i => i.roleKey !== 'replay_camera'),
        uniview, { ...dahua, isActive: false }],
    )
    vi.mocked(listChoices).mockResolvedValueOnce(
      [{ roleKey: 'replay_camera', itemId: dahua.id }],
    )
    vi.mocked(listLines).mockResolvedValueOnce([{
      id: 'l-cam', venueId: 'v1', itemId: uniview.id, roleKey: 'replay_camera',
      qty: 8, originRoleKey: null, sortOrder: 0, source: 'manual',
      suppressed: false, note: null,
    }])

    await renderDetail()
    // CHOICE_UNAVAILABLE still fires — the pick really is gone. What must not
    // appear is a second warning claiming the list and the sizing disagree.
    expect(await screen.findByText(/deactivated or no longer fills that role/))
      .toBeInTheDocument()
    expect(screen.queryByText(/edited by hand/i)).not.toBeInTheDocument()
  })

  // The mirror of the case above, and the reason a `find` on its own is not
  // enough: a role can hold two manual lines — a hand-edited formula line plus
  // one added by hand — and the first can agree while the second prints an item
  // the venue is not sized on. Reporting the first and stopping hides it.
  it('names the drifted line when another line on the same role agrees', async () => {
    const { listItems } = await import('@/data/items')
    const { listLines } = await import('@/data/venueStore')

    vi.mocked(listItems).mockResolvedValueOnce(twoCameras)
    vi.mocked(listLines).mockResolvedValueOnce([
      {
        id: 'l-cam', venueId: 'v1', itemId: uniview.id, roleKey: 'replay_camera',
        qty: 6, originRoleKey: null, sortOrder: 0, source: 'manual',
        suppressed: false, note: null,
      },
      {
        id: 'l-cam-2', venueId: 'v1', itemId: dahua.id, roleKey: 'replay_camera',
        qty: 2, originRoleKey: null, sortOrder: 1, source: 'manual',
        suppressed: false, note: null,
      },
    ])

    await renderDetail()
    const said = await screen.findByText(/edited by hand/i)
    expect(said.textContent).toContain(dahua.name)
  })

  // B1: a swap that crosses roles leaves the line under its NEW roleKey and
  // records the vacated role in originRoleKey (see MaterialsTable's swap()).
  // A roleKey-only match against replay_camera would find nothing here, so
  // the vacated role's picker would look wired to a line while nothing on
  // screen actually reads from it — the warning has to catch this case too.
  it('warns when the chosen role\'s line was hand-swapped to a different role', async () => {
    const { listItems } = await import('@/data/items')
    const { listLines } = await import('@/data/venueStore')

    vi.mocked(listItems).mockResolvedValueOnce(twoCameras)
    vi.mocked(listLines).mockResolvedValueOnce([{
      id: 'l-cam', venueId: 'v1', itemId: 'display', roleKey: 'display',
      qty: 1, originRoleKey: 'replay_camera', sortOrder: 0, source: 'manual',
      suppressed: false, note: null,
    }])

    await renderDetail()
    expect(await screen.findByText(/hand-swapped/i)).toBeInTheDocument()
  })
})

// A conflict on a local venue has no account behind it — the other writer is a
// second tab in this browser, which is how anyone compares two configurations.
// Telling the user "another account" names a thing that does not exist and
// points them at nothing they can check.
it('names the other TAB, not another account, when the venue is local', async () => {
  const storeMod = await import('@/data/venueStore')
  const { VenueConflictError } = await import('@/data/venueLines')
  vi.mocked(storeMod.isLocalVenueId).mockReturnValue(true)
  vi.mocked(storeMod.saveVenueAndLines).mockRejectedValueOnce(
    new VenueConflictError(null, '2026-08-26T10:00:00.001Z'),
  )
  await renderDetail()
  fireEvent.click(await screen.findByRole('button', { name: 'Save' }))
  // Both halves, separately: the plan's copy puts "another tab" in the title
  // AND the body, so a single findByText matches two nodes and throws.
  expect(await screen.findByRole('heading', { name: /another tab/i }))
    .toBeInTheDocument()
  expect(screen.getByText(/another tab in this browser saved it/i))
    .toBeInTheDocument()
  expect(screen.queryByText(/another account/i)).not.toBeInTheDocument()
})

// The database case is unchanged, and the reason it needs its own assertion is
// that a single shared sentence would be the cheap way to "fix" the above —
// and it would drop the one thing the database dialog can say and this one
// cannot: whose work is at stake.
//
// It overlaps the conflict test above, which also asserts the email is shown.
it('still names the account for a database venue', async () => {
  const storeMod = await import('@/data/venueStore')
  const { VenueConflictError } = await import('@/data/venueLines')
  // Explicit, not inherited from the file's beforeEach: this test's whole job
  // is to pin the isLocalVenueId -> false branch, so the local sentence cannot
  // be made unconditional and left green.
  vi.mocked(storeMod.isLocalVenueId).mockReturnValue(false)
  vi.mocked(storeMod.saveVenueAndLines).mockRejectedValueOnce(
    new VenueConflictError('other@kosmas.com', '2026-08-19T09:00:00.000001+00:00'),
  )
  await renderDetail()
  fireEvent.click(await screen.findByRole('button', { name: 'Save' }))
  expect(await screen.findByText(/other@kosmas\.com/)).toBeInTheDocument()
})

describe('a venue this browser cannot load', () => {
  // The concrete case: an anonymous visitor opens a link to a Kosmas venue.
  // The venues RLS policy is `to authenticated`, so the read returns no rows,
  // and until now that produced an auto-dismissing toast over a spinner that
  // never resolved — no explanation and no way onward.
  it('says so, instead of spinning forever', async () => {
    const { getVenue } = await import('@/data/venueStore')
    const { VenueMissingError } = await import('@/data/venueLines')
    vi.mocked(getVenue).mockRejectedValueOnce(new VenueMissingError())
    await renderDetail()
    // `isn.t` so the typographic apostrophe the copy actually uses still matches.
    expect(await screen.findByText(/isn.t here|is not here/i)).toBeInTheDocument()
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
  })

  // A dead end is the failure, not the message. The URL is bookmarkable, so
  // the visitor may have arrived with no history to go back to.
  it('offers the way back to the venue list', async () => {
    const { getVenue } = await import('@/data/venueStore')
    const { VenueMissingError } = await import('@/data/venueLines')
    vi.mocked(getVenue).mockRejectedValueOnce(new VenueMissingError())
    await renderDetail()
    expect(await screen.findByRole('link', { name: /all venues/i })).toBeInTheDocument()
  })

  // Anything else keeps its own words. Telling someone their venue is missing
  // when the network dropped sends them looking for the wrong thing.
  it('reports an unrelated failure in its own terms', async () => {
    const { getVenue } = await import('@/data/venueStore')
    vi.mocked(getVenue).mockRejectedValueOnce(new Error('Failed to fetch'))
    await renderDetail()
    expect(await screen.findByText(/Failed to fetch/)).toBeInTheDocument()
  })
})

describe('the session ending while a venue is open', () => {
  // Nothing on this screen reacted to the session before, because App unmounted
  // the whole tree on sign-out. With that gone, a signed-out admin is left
  // looking at a database venue whose Save can no longer succeed — and a
  // programmatic navigate bypasses both the back-link intercept and the leaving
  // guard, so the edits would vanish behind a toast that clears itself.
  it('says the edits are lost, in a dialog rather than a toast', async () => {
    const storeMod = await import('@/data/venueStore')
    vi.mocked(storeMod.isLocalVenueId).mockReturnValue(false)
    session.current = { user: { id: 'u1' } }
    const { rerender } = await renderDetail()
    session.current = null
    await rerenderDetail(rerender)
    expect(await screen.findByText(/signed out/i)).toBeInTheDocument()
    expect(screen.getByText(/unsaved/i)).toBeInTheDocument()
  })

  // Saving is impossible without a session, so an exit offering to save would
  // offer something that cannot succeed. One way out, and it is honest.
  it('offers no Save-and-leave, because there is nothing that could save', async () => {
    const storeMod = await import('@/data/venueStore')
    vi.mocked(storeMod.isLocalVenueId).mockReturnValue(false)
    session.current = { user: { id: 'u1' } }
    const { rerender } = await renderDetail()
    session.current = null
    await rerenderDetail(rerender)
    expect(screen.queryByRole('button', { name: /save and leave/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /all venues/i })).toBeInTheDocument()
  })

  // §3.12, the mirror, and the answer is deliberately "nothing". A local venue
  // keeps routing locally under id dispatch; the only stale thing is the
  // catalog, and supplier and notes are not rendered on this screen at all.
  // Re-keying the loader on the session would discard unsaved edits instead.
  it('leaves a LOCAL venue alone when the session ends', async () => {
    const storeMod = await import('@/data/venueStore')
    vi.mocked(storeMod.isLocalVenueId).mockReturnValue(true)
    session.current = { user: { id: 'u1' } }
    const { rerender } = await renderDetail()
    session.current = null
    await rerenderDetail(rerender)
    expect(screen.queryByText(/signed out/i)).not.toBeInTheDocument()
  })

  // A venue that never had a session cannot LOSE one. Without the "had a
  // session" edge, every anonymous visitor would meet this dialog on arrival.
  it('never fires for a visitor who was anonymous all along', async () => {
    const storeMod = await import('@/data/venueStore')
    // Explicit, not inherited: the previous test set this true.
    vi.mocked(storeMod.isLocalVenueId).mockReturnValue(false)
    session.current = null
    await renderDetail()
    // WAIT FOR THE VENUE TO LOAD FIRST. The watch is gated on `venue`, so
    // asserting straight after render() checks an empty screen and passes
    // whatever the condition says — verified by mutation: dropping the
    // hadSession edge did not fail this test until it waited.
    await screen.findByRole('button', { name: 'Save' })
    expect(screen.queryByText(/signed out/i)).not.toBeInTheDocument()
  })

  /**
   * THE REASON useVenueLoad's effect is keyed on [id] and nothing else.
   *
   * A token refresh fires roughly hourly and hands down a NEW session object
   * with the same user. Adding `session` to that dependency array — which is
   * exactly what the standing exhaustive-deps warning asks for — re-runs the
   * loader, and setVenue/setLines/setChoices then overwrite whatever the user
   * has typed. It is silent, it is unrecoverable, and it happens to someone
   * mid-edit rather than under test.
   *
   * The other three tests in this block change the session and assert on the
   * signed-out dialog; none of them edits first, so all three stay green with
   * `session` in the deps. This is the one that does not.
   */
  it('keeps unsaved edits when the session object is replaced', async () => {
    const storeMod = await import('@/data/venueStore')
    vi.mocked(storeMod.isLocalVenueId).mockReturnValue(false)
    session.current = { user: { id: 'u1' }, access_token: 'first' }
    const { rerender } = await renderDetail()

    const courts = await screen.findByLabelText(/courts/i)
    fireEvent.change(courts, { target: { value: '12' } })
    // findAllByText: SaveStatus renders it in the toolbar AND as the mobile
    // UnsavedStrip, so the singular query is ambiguous here.
    expect(await screen.findAllByText(/unsaved changes/i)).not.toHaveLength(0)

    // Still signed in, still the same user — only the token moved on. The
    // signed-out watch must not fire either, which is why this asserts both.
    session.current = { user: { id: 'u1' }, access_token: 'refreshed' }
    await rerenderDetail(rerender)

    expect(await screen.findByLabelText(/courts/i)).toHaveValue(12)
    expect(screen.getAllByText(/unsaved changes/i)).not.toHaveLength(0)
    expect(screen.queryByText(/signed out/i)).not.toBeInTheDocument()
  })

  // §1.6's other half. Typing PT404 without this leaves the save path showing a
  // raw `venue_not_found` toast, which is what the clause exists to remove.
  it('explains a save into a venue that is no longer there', async () => {
    const storeMod = await import('@/data/venueStore')
    const { VenueMissingError } = await import('@/data/venueLines')
    vi.mocked(storeMod.isLocalVenueId).mockReturnValue(false)
    vi.mocked(storeMod.saveVenueAndLines).mockRejectedValueOnce(new VenueMissingError())
    await renderDetail()
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('button', { name: /all venues/i })).toBeInTheDocument()
    expect(screen.queryByText('venue_not_found')).not.toBeInTheDocument()
  })
})

describe('SaveStatus on a local venue', () => {
  it('confirms the save in the toolbar rather than showing nothing', async () => {
    const storeMod = await import('@/data/venueStore')
    vi.mocked(storeMod.isLocalVenueId).mockReturnValue(true)
    vi.mocked(storeMod.getVenue).mockResolvedValueOnce({
      ...venue, createdByEmail: null, updatedByEmail: null,
    })
    await renderDetail()
    expect(await screen.findByText(/Saved in this browser/)).toBeInTheDocument()
  })

  // Same rule as the database line, and the same reason: --muted-foreground on
  // the navy band came out at 1.46:1.
  it('keeps that line off the band whose grey it cannot use', async () => {
    const storeMod = await import('@/data/venueStore')
    vi.mocked(storeMod.isLocalVenueId).mockReturnValue(true)
    vi.mocked(storeMod.getVenue).mockResolvedValueOnce({
      ...venue, createdByEmail: null, updatedByEmail: null,
    })
    await renderDetail()
    const line = await screen.findByText(/Saved in this browser/)
    expect(line.closest('.bg-railhd')).toBeNull()
  })
})

// The exporter moved behind a dynamic import so it stops riding in the entry
// chunk (1194 kB -> 721 kB). That makes the click asynchronous for the first
// time, which is the whole of what these three tests are about: it must still
// reach the exporter with the same arguments, it must not wedge the button, and
// a fetch that fails must say so rather than look like a dead control.
describe('exporting the PDF', () => {
  // This venue's saved lines are one UPS row against a full 8-court
  // calculation, so the sheet is always stale and the button always routes
  // through the dialog. Going straight for "Export anyway" is not a shortcut
  // past that — it IS the second call site of doExport.
  const exportAnyway = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Export PDF' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Export anyway' }))
  }

  it('still hands the exporter the venue, its lines and the full catalog', async () => {
    await renderDetail()
    await exportAnyway()

    const { exportMaterialsPdf } = await import('@/pdf/exportMaterials')
    await waitFor(() => expect(exportMaterialsPdf).toHaveBeenCalledTimes(1))
    const call = vi.mocked(exportMaterialsPdf).mock.calls[0]
    expect(call[0]).toBe('Tela Park')
    expect(call[1]).toBe('Pro')
    expect(call[2]).toEqual(savedLines)
    // catalogAll, not the collapsed one: a saved line whose item was
    // deactivated still has to name it on the sheet.
    expect(call[3]).toBe(testCatalog)
    // `Venue extends VenueInputs`, so the port plan is sized from the same
    // object the inputs form edits — no adapter, and no second source of truth
    // for courts.
    expect(call[4]).toMatchObject({ courts: 8, tier: 'pro' })
  })

  // The EXPORTER threw, having loaded fine. Its message is the only diagnostic
  // there is, so it survives into the toast — and no reload is suggested,
  // because reloading would change nothing about a venue that renders badly.
  //
  // The other half of that branch, a chunk that never loads, is driven in
  // lazy-pdf-chunk.mjs instead of faked here: vi.mock replaces the module
  // before a network layer exists, so the honest way to make an import reject
  // is to abort the real request, which needs a browser.
  it('keeps the exporter\u2019s own message when it loads and then throws', async () => {
    const { exportMaterialsPdf } = await import('@/pdf/exportMaterials')
    vi.mocked(exportMaterialsPdf).mockImplementationOnce(() => {
      throw new Error('qty must be a positive integer')
    })
    const { toast } = await import('sonner')

    await renderDetail()
    await exportAnyway()

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
    const message = vi.mocked(toast.error).mock.calls[0][0]
    expect(message).toMatch(/Could not export the PDF.*qty must be a positive integer/)
    expect(message).not.toMatch(/reload/i)
  })

  // The `finally` in doExport. Without it a single failed export disables the
  // button for the rest of the session, which is a worse outcome than the
  // unhandled rejection the catch was added to replace.
  it('re-enables the button after a failed export', async () => {
    const { exportMaterialsPdf } = await import('@/pdf/exportMaterials')
    vi.mocked(exportMaterialsPdf).mockImplementationOnce(() => {
      throw new Error('nope')
    })

    await renderDetail()
    await exportAnyway()

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Export PDF' })).toBeEnabled())
  })
})
