import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Item } from '@/calculator/types'
import { ItemForm } from './ItemForm'

const macMini: Item = {
  id: 'mac', name: 'Mac mini (M4)', category: 'compute', roleKey: 'mac_mini',
  supplier: null, poeWatts: null, mainsWatts: 65, rackU: 0,
  isActive: true, isDefault: true, notes: null, printNote: null,
}

/**
 * Mains draw is a direct UPS input — the rung is sized on
 * (poeWatts + mainsWatts) — and until 2026-08-24 this form had no field for
 * it at all. That is what made upsertItem's `?? null` a data-loss bug rather
 * than an inconvenience: the value could be destroyed by editing the name and
 * then could not be typed back in.
 */
describe('ItemForm mains watts', () => {
  it('shows the stored mains draw', () => {
    render(<ItemForm item={macMini} onSave={vi.fn(async () => {})} onCancel={vi.fn()} />)
    expect(screen.getByLabelText(/Mains watts/i)).toHaveValue(65)
  })

  // The regression this pairs with: a save that edits something ELSE must
  // carry the mains draw through untouched, not drop it.
  it('sends it back unchanged when another field is edited', async () => {
    const onSave = vi.fn(async (_item: Partial<Item> & { name: string }) => {})
    render(<ItemForm item={macMini} onSave={onSave} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Mac mini (M4) 16GB' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0]).toMatchObject({
      name: 'Mac mini (M4) 16GB', mainsWatts: 65,
    })
  })

  it('sends an edited value as a number', async () => {
    const onSave = vi.fn(async (_item: Partial<Item> & { name: string }) => {})
    render(<ItemForm item={macMini} onSave={onSave} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/Mains watts/i), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0]).toMatchObject({ mainsWatts: 30 })
  })

  // An empty field is an item that draws nothing from the wall — a real state,
  // and distinct from the field not existing.
  it('sends null when cleared', async () => {
    const onSave = vi.fn(async (_item: Partial<Item> & { name: string }) => {})
    render(<ItemForm item={macMini} onSave={onSave} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/Mains watts/i), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0]).toMatchObject({ mainsWatts: null })
  })
})
