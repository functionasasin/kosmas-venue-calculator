import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const venues = [
  {
    id: 'v1', name: 'Tela Park', courts: 8, tier: 'pro' as const,
    securityCameras: 0, kisiDoors: 0 as const,
    extendedRetention: false,
  },
]

const deleteVenue = vi.fn(async (_id: string) => undefined)

vi.mock('@/data/venueStore', () => ({
  listVenues: vi.fn(async () => ({ venues, unreadable: [] })),
  saveVenue: vi.fn(async (v: unknown) => v),
  deleteVenue: (...args: [string]) => deleteVenue(...args),
  isLocalVenueId: (id: string) => id.startsWith('local_'),
}))
// Drivable: the storage-blocked banner is the one state a test cannot reach by
// arranging data, because the probe writes to real localStorage.
const storageOk = { current: true }
vi.mock('@/data/localVenues', () => ({ storageAvailable: () => storageOk.current }))
// Driven per test. Default to a signed-in admin, which is what every test
// written before this plan assumes — Venues reads session?.user.id for the
// effect key and the signedIn flag, so without one the screen would list only
// local venues and the fixture would never render.
const session = { current: { user: { id: 'u1' } } as unknown }
const role = { current: 'admin' as 'admin' | null }
vi.mock('@/auth/useRole', () => ({ useRole: () => role.current }))
vi.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ signOut: vi.fn(), session: session.current }),
}))

beforeEach(() => {
  session.current = { user: { id: 'u1' } }
  role.current = 'admin'
  storageOk.current = true
})

const renderVenues = async () => {
  const { Venues } = await import('./Venues')
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Venues />} />
        <Route path="/venues/:id" element={<p>venue detail</p>} />
      </Routes>
    </MemoryRouter>,
  )
  await screen.findByText('Tela Park')
}

describe('Venues delete', () => {
  beforeEach(() => { deleteVenue.mockClear() })

  // The row is itself a navigation target, so a click on any control inside it
  // bubbles up and routes away. Without stopPropagation the confirm dialog
  // opens on a screen the user is already leaving — and the venue survives
  // while looking like the click did nothing.
  it('opens the confirmation without navigating to the venue it is about to delete', async () => {
    await renderVenues()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Tela Park' }))

    expect(await screen.findByText(/cannot be undone/i)).toBeTruthy()
    expect(screen.queryByText('venue detail')).toBeNull()
  })

  // Deleting cascades to venue_lines and is irreversible, so the row button
  // must never be the thing that performs it.
  it('does not delete until the confirmation is accepted', async () => {
    await renderVenues()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Tela Park' }))
    expect(deleteVenue).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Delete venue' }))
    await waitFor(() => expect(deleteVenue).toHaveBeenCalledWith('v1'))
  })

  it('drops the row once the delete succeeds, so the list matches the database', async () => {
    await renderVenues()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Tela Park' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete venue' }))
    await waitFor(() => expect(screen.queryByText('Tela Park')).toBeNull())
  })

  it('keeps the row when the delete fails, rather than showing a list the database disagrees with', async () => {
    deleteVenue.mockRejectedValueOnce(new Error('nope'))
    await renderVenues()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Tela Park' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete venue' }))
    await waitFor(() => expect(deleteVenue).toHaveBeenCalled())
    expect(screen.getByText('Tela Park')).toBeTruthy()
  })
})

// Base UI's Button assumes a native <button> unless told otherwise, so styling
// a router Link with it left an anchor still carrying button semantics. The
// browser console said so outright: "A component that acts as a button expected
// a native <button> ... Rendering a non-<button> removes native button
// semantics, which can impact forms and accessibility."
describe('Venues navigation controls', () => {
  it('exposes Catalog as a link, since it navigates rather than acts', async () => {
    await renderVenues()
    const catalog = screen.getByRole('link', { name: 'Catalog' })
    expect(catalog.getAttribute('href')).toBe('/catalog')
  })

  // The concrete regression: an anchor announced as a button loses the
  // affordances a link has — open in a new tab, copy address, and the
  // middle-click that goes with them. Base UI reaches that state two different
  // ways, so both are pinned: type="button" when it assumes a native button,
  // role="button" when told it isn't one.
  it('does not leave button semantics on the anchor', async () => {
    await renderVenues()
    const catalog = screen.getByRole('link', { name: 'Catalog' })
    expect(catalog.tagName).toBe('A')
    expect(catalog.hasAttribute('type')).toBe(false)
    expect(catalog.getAttribute('role')).toBeNull()
  })
})

describe('Venues theme', () => {
  it('offers the theme toggle from the venues bar', async () => {
    await renderVenues()
    expect(screen.getByRole('button', { name: /switch to .* theme/i })).toBeInTheDocument()
  })

  // Presence alone let the toggle sit third in this bar — after New venue,
  // beside Sign out — while Catalog and VenueDetail led with it. The rule is
  // that it leads the action cluster on every screen, so assert the position,
  // not just that it rendered.
  it('puts the theme toggle first in the action cluster', async () => {
    await renderVenues()
    const toggle = screen.getByRole('button', { name: /switch to .* theme/i })
    expect(toggle.parentElement?.firstElementChild).toBe(toggle)
  })
})

describe('the Venues toolbar and the session', () => {
  // /login is an EMPLOYEE door. There is one account, the Kosmas admin's, and
  // the anonymous path deliberately cannot reach the database at all — the
  // venues RLS policies are `to authenticated`. A Sign in button in the action
  // cluster, beside New venue, invited a prospect to make an account that does
  // not exist. The route stays; nothing in the UI points at it.
  //
  // Asserted by href as well as by name, so a re-worded link — "Log in",
  // "Admin", an icon with a label — cannot slip past a name query.
  it('offers an anonymous visitor no way in', async () => {
    session.current = null
    role.current = null
    await renderVenues()
    expect(screen.queryByRole('link', { name: /sign in/i })).not.toBeInTheDocument()
    expect(document.querySelector('a[href="/login"]')).toBeNull()
  })

  // The slot is Sign out or nothing now — it used to be "never both and never
  // NEITHER". Sign out cannot go with it: without it a signed-in admin has no
  // way out, and this toolbar is the only place it has ever lived.
  it('offers Sign out as a BUTTON when someone is signed in', async () => {
    await renderVenues()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /sign in/i })).not.toBeInTheDocument()
  })

  // Requirement 3's nav half. The gate was already right; this pins it against
  // the rewrite of the cluster around it.
  it('keeps the Catalog button away from an anonymous visitor', async () => {
    session.current = null
    role.current = null
    await renderVenues()
    expect(screen.queryByRole('link', { name: 'Catalog' })).not.toBeInTheDocument()
  })
})

describe('the Venues list says when it is still fetching', () => {
  // "No venues yet. Click 'New venue' to create one." used to flash during
  // every fetch. That was survivable when the list was always the same admin's;
  // it now invites a signed-in admin who is momentarily looking at an empty
  // table to create a venue they already have.
  it('shows a loading row rather than the empty-state copy while fetching', async () => {
    const { listVenues } = await import('@/data/venueStore')
    let release: (v: { venues: unknown[]; unreadable: unknown[] }) => void = () => {}
    vi.mocked(listVenues).mockReturnValueOnce(
      new Promise(r => { release = r }) as never,
    )
    const { Venues } = await import('./Venues')
    render(
      <MemoryRouter><Routes><Route path="/" element={<Venues />} /></Routes></MemoryRouter>,
    )
    expect(screen.getByText(/loading venues/i)).toBeInTheDocument()
    expect(screen.queryByText(/No venues yet/)).not.toBeInTheDocument()
    release({ venues: [], unreadable: [] })
    expect(await screen.findByText(/No venues yet/)).toBeInTheDocument()
  })
})

describe('where each venue lives', () => {
  // A venue an admin built while accidentally signed out has no audit stamp,
  // no cross-device access, is invisible to the other employee and is gone if
  // site data is cleared — and the app said "Saved" every time. Without this
  // the two kinds of row are indistinguishable.
  it('badges a local venue so it cannot be mistaken for a database one', async () => {
    const { listVenues } = await import('@/data/venueStore')
    vi.mocked(listVenues).mockResolvedValueOnce({
      venues: [
        { ...venues[0], id: 'local_abc', name: 'Prospect A' },
        { ...venues[0], id: 'v1', name: 'Tela Park' },
      ],
      unreadable: [],
    } as never)
    // Safe through renderVenues: this case DOES render a 'Tela Park' row.
    await renderVenues()
    const local = screen.getByText('Prospect A').closest('td')
    const remote = screen.getByText('Tela Park').closest('td')
    expect(local).toHaveTextContent(/this browser/i)
    expect(remote).not.toHaveTextContent(/this browser/i)
  })

  // Surfaced, never auto-deleted — it is the user's only copy. Carried out of
  // the data layer by Plan 2 and dropped on the floor until now, which means a
  // venue that exists is simply absent from the list with no explanation.
  //
  // NOT through renderVenues: that helper ends by waiting for a 'Tela Park'
  // row, and both of these cases resolve an EMPTY venues array on purpose — so
  // the helper would time out waiting for a row the test did not provide.
  const renderEmpty = async (unreadable: unknown[]) => {
    const { listVenues } = await import('@/data/venueStore')
    vi.mocked(listVenues).mockResolvedValueOnce({ venues: [], unreadable } as never)
    const { Venues } = await import('./Venues')
    render(
      <MemoryRouter><Routes><Route path="/" element={<Venues />} /></Routes></MemoryRouter>,
    )
  }

  it('says when a venue in this browser could not be read', async () => {
    await renderEmpty([{ id: 'local_abc', reason: 'unreadable' }])
    expect(await screen.findByText(/could not be read/i)).toBeInTheDocument()
  })

  it('distinguishes a blob written by a newer build from a damaged one', async () => {
    await renderEmpty([{ id: 'local_abc', reason: 'newer_schema' }])
    expect(await screen.findByText(/newer version/i)).toBeInTheDocument()
  })
})

describe('when this browser will not store anything', () => {
  // Safari private mode throws on access. localStorage is an anonymous
  // visitor's ONLY store, so with it unavailable they have no product — and
  // discovering that after twenty minutes of work is the actual failure.
  it('warns an anonymous visitor up front and disables New venue', async () => {
    session.current = null
    role.current = null
    storageOk.current = false
    await renderVenues()
    expect(screen.getByText(/cannot save venues/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New venue' })).toBeDisabled()
  })

  // `blocked` is `!storageOk && !userId`, so this banner is shown ONLY to
  // visitors with no session — which is exactly the group that must never write
  // to the database. It used to close with "Sign in to save to the database
  // instead", advice addressed to the one audience it is wrong for, and with
  // nothing in the UI pointing at /login it is not even actionable. The screen
  // states the consequence and stops there.
  it('does not send an anonymous visitor to a database they cannot use', async () => {
    session.current = null
    role.current = null
    storageOk.current = false
    await renderVenues()
    const banner = screen.getByText(/cannot save venues/i)
    expect(banner.textContent).not.toMatch(/sign in/i)
    expect(banner.textContent).not.toMatch(/database/i)
  })

  // A signed-in admin's venues go to the database. Blocking them because a
  // store they are not using is unavailable would be a bug, not caution.
  it('leaves a signed-in admin working normally', async () => {
    storageOk.current = false
    await renderVenues()
    expect(screen.queryByText(/cannot save venues/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New venue' })).not.toBeDisabled()
  })
})
