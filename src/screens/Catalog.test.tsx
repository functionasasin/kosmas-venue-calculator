import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Item } from '@/calculator/types'

const base: Item = {
  id: 'uni', name: 'Uniview Owlview', category: 'camera',
  roleKey: 'replay_camera', supplier: null, poeWatts: 2.8, mainsWatts: null,
  rackU: 0, isActive: true, isDefault: true, notes: null, printNote: null,
}
const dahua: Item = { ...base, id: 'dah', name: 'Dahua 5459T', isDefault: false }

const listItems = vi.fn(async (): Promise<Item[]> => [base, dahua])
const setItemActive = vi.fn(async () => {})
const setItemDefault = vi.fn(async () => {})
vi.mock('@/data/items', () => ({
  listItems, upsertItem: vi.fn(async () => {}), setItemActive, setItemDefault,
}))

beforeEach(() => vi.clearAllMocks())

const renderCatalog = async () => {
  const { Catalog } = await import('./Catalog')
  render(<MemoryRouter><Catalog /></MemoryRouter>)
  await screen.findByText('Uniview Owlview')
}

/**
 * The list had a PoE W column and nothing for mains, so seven items' mains
 * draw — the Mac mini's 65 W among them — existed only in the database. One
 * POWER column instead of two: no powered item in this catalog draws both
 * ways, so a second numeric column would be empty on almost every row of a
 * table that already scrolls sideways on a phone.
 */
describe('Catalog power column', () => {
  it('names the kind of draw, not just the number', async () => {
    listItems.mockResolvedValueOnce([
      { ...base, id: 'mac', name: 'Mac mini (M4)', roleKey: 'mac_mini',
        poeWatts: null, mainsWatts: 65 },
      base,
    ])
    await renderCatalog()
    expect(screen.getByText('65 mains')).toBeInTheDocument()
    expect(screen.getByText('2.8 PoE')).toBeInTheDocument()
  })

  it('shows both when an item somehow draws both ways', async () => {
    listItems.mockResolvedValueOnce([
      { ...base, poeWatts: 7, mainsWatts: 20 },
    ])
    await renderCatalog()
    expect(screen.getByText('7 PoE + 20 mains')).toBeInTheDocument()
  })

  it('replaces the PoE W header rather than adding a column', async () => {
    listItems.mockResolvedValueOnce([{ ...base, poeWatts: null, mainsWatts: null }])
    await renderCatalog()
    expect(screen.getByRole('columnheader', { name: 'Power' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'PoE W' })).not.toBeInTheDocument()
    // Nothing to report is an em dash, the same as Rack U's empty state.
    expect(screen.getByText('Uniview Owlview').closest('tr')?.textContent)
      .toContain('—')
  })
})

describe('Catalog with two items on one role', () => {
  // The old guard refused to activate a second item for a role, because
  // items_role_key_active would have rejected the write. That index is gone
  // and this is now the supported state — a guard here would block the whole
  // feature at the only screen that can enable it.
  it('activates a second item on a role that already has one', async () => {
    listItems.mockResolvedValueOnce([base, { ...dahua, isActive: false }])
    await renderCatalog()
    fireEvent.click(screen.getAllByRole('button', { name: 'Reactivate' })[0])
    await waitFor(() => expect(setItemActive).toHaveBeenCalledWith('dah', true))
  })

  it('marks which item is the role\'s default', async () => {
    await renderCatalog()
    expect(screen.getByText('default')).toBeInTheDocument()
  })

  // Through the RPC, never two writes — see 0011.
  it('moves the default through set_item_default', async () => {
    await renderCatalog()
    fireEvent.click(screen.getByRole('button', { name: /Make default/i }))
    await waitFor(() => expect(setItemDefault).toHaveBeenCalledWith('dah'))
  })

  // A deactivated row cannot hold a default — the 0011 trigger clears it — so
  // offering the control would promise something the database undoes.
  it('does not offer to default a deactivated item', async () => {
    listItems.mockResolvedValueOnce([base, { ...dahua, isActive: false }])
    await renderCatalog()
    expect(screen.queryByRole('button', { name: /Make default/i }))
      .not.toBeInTheDocument()
  })
})
