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

vi.mock('@/data/venues', () => ({
  getVenue: vi.fn(async () => venue),
  saveVenue: vi.fn(async (v: unknown) => v),
}))
vi.mock('@/data/items', () => ({
  listItems: vi.fn(async (): Promise<Item[]> => testCatalog),
}))
vi.mock('@/data/venueItemChoices', () => ({ listChoices: vi.fn(async () => []) }))
vi.mock('@/data/venueLines', async () => {
  const real = await vi.importActual<typeof import('@/data/venueLines')>(
    '@/data/venueLines',
  )
  return {
    ...real,
    listLines: vi.fn(async () => savedLines),
    saveVenueAndLines: vi.fn(
      async (v: unknown, l: unknown, _catalog: unknown, ch: unknown) =>
        ({ venue: v, lines: l, choices: ch ?? [] }),
    ),
  }
})
vi.mock('@/auth/useRole', () => ({ useRole: () => 'admin' }))

// Top-level, not just inside the describe below: without it the mocks
// accumulate calls across the file's top-level tests, so any assertion on a
// call COUNT silently measures every earlier test too.
beforeEach(() => vi.clearAllMocks())

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
    const { getVenue } = await import('@/data/venues')
    const { listItems } = await import('@/data/items')
    const { listLines } = await import('@/data/venueLines')
    const { listChoices } = await import('@/data/venueItemChoices')

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
    const { listLines, saveVenueAndLines } = await import('@/data/venueLines')
    const { listChoices } = await import('@/data/venueItemChoices')

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
    const { saveVenueAndLines } = await import('@/data/venueLines')

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
    const { saveVenueAndLines } = await import('@/data/venueLines')
    const { listChoices } = await import('@/data/venueItemChoices')

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
    const { saveVenueAndLines } = await import('@/data/venueLines')
    const { listChoices } = await import('@/data/venueItemChoices')

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
    const { listLines } = await import('@/data/venueLines')
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
    const { listChoices } = await import('@/data/venueItemChoices')

    vi.mocked(listItems).mockResolvedValueOnce(
      [uniview, { ...dahua, isActive: false }],
    )
    vi.mocked(listChoices).mockResolvedValueOnce(
      [{ roleKey: 'replay_camera', itemId: 'dah' }],
    )

    await renderDetail()
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
    const { listLines } = await import('@/data/venueLines')

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
    const { listLines } = await import('@/data/venueLines')

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

  // B1: a swap that crosses roles leaves the line under its NEW roleKey and
  // records the vacated role in originRoleKey (see MaterialsTable's swap()).
  // A roleKey-only match against replay_camera would find nothing here, so
  // the vacated role's picker would look wired to a line while nothing on
  // screen actually reads from it — the warning has to catch this case too.
  it('warns when the chosen role\'s line was hand-swapped to a different role', async () => {
    const { listItems } = await import('@/data/items')
    const { listLines } = await import('@/data/venueLines')

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
