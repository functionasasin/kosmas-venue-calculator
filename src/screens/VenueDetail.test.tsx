import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { Item } from '@/calculator/types'
import type { StoredLine } from '@/data/venueLines'
import { testCatalog } from '@/calculator/testCatalog'

const venue = {
  id: 'v1', name: 'Tela Park', courts: 8, tier: 'pro' as const,
  securityCameras: 0, kisiDoors: 0 as const,
  extendedRetention: false,
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
    saveLines: vi.fn(async () => undefined),
  }
})
vi.mock('@/auth/useRole', () => ({ useRole: () => 'admin' }))

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
