import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const venues = [
  {
    id: 'v1', name: 'Tela Park', courts: 8, tier: 'pro' as const,
    securityCameras: 0, kisiDoors: 0, brand: 'podplay' as const,
    extendedRetention: false,
  },
]

const deleteVenue = vi.fn(async (_id: string) => undefined)

vi.mock('@/data/venues', () => ({
  listVenues: vi.fn(async () => venues),
  saveVenue: vi.fn(async (v: unknown) => v),
  deleteVenue: (...args: [string]) => deleteVenue(...args),
}))
vi.mock('@/auth/useRole', () => ({ useRole: () => 'admin' }))
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ signOut: vi.fn() }) }))

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
