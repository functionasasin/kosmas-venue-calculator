import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VenueInputsForm } from './VenueInputsForm'
import type { VenueInputs } from '@/calculator/types'

const inputs: VenueInputs = {
  courts: 8, tier: 'pro', securityCameras: 0,
  kisiDoors: 0, brand: 'podplay', extendedRetention: false,
}

const tierSelect = () => screen.getByLabelText('Tier') as HTMLSelectElement
const optionsOf = (s: HTMLSelectElement) =>
  [...s.options].map(o => ({ value: o.value, label: o.textContent }))

describe('VenueInputsForm tier picker', () => {
  // The dropdown is the only place a tier is ever set, so it is the app's
  // working definition of the lineup. tiers-reference.md § lineup confirmed
  // 2026-08-11: five tiers, ladder order, Pro+ removed and Basic live.
  it('offers exactly the five live tiers, in ladder order, labelled for humans', () => {
    render(<VenueInputsForm value={inputs} onChange={vi.fn()} />)
    expect(optionsOf(tierSelect())).toEqual([
      { value: 'basic', label: 'Basic' },
      { value: 'basic_plus', label: 'Basic+' },
      { value: 'pro', label: 'Pro' },
      { value: 'autonomous', label: 'Autonomous' },
      { value: 'autonomous_plus', label: 'Autonomous+' },
    ])
  })

  // Pro+ was removed on 2026-08-11. Leaving it selectable would let someone
  // save a tier the gates have no rules for.
  it('does not offer Pro+', () => {
    render(<VenueInputsForm value={inputs} onChange={vi.fn()} />)
    expect(optionsOf(tierSelect()).some(o => /pro_plus|Pro\+/.test(o.value + o.label)))
      .toBe(false)
  })

  // Guards the silent failure a stale stored tier causes: a <select> whose
  // value matches no option renders as though a different tier were current.
  it('shows the venue\'s own tier as selected', () => {
    render(<VenueInputsForm value={{ ...inputs, tier: 'autonomous_plus' }} onChange={vi.fn()} />)
    expect(tierSelect().value).toBe('autonomous_plus')
  })

  it('reports the chosen tier by its stored key, not its label', () => {
    const onChange = vi.fn()
    render(<VenueInputsForm value={inputs} onChange={onChange} />)
    fireEvent.change(tierSelect(), { target: { value: 'basic' } })
    expect(onChange).toHaveBeenCalledWith({ ...inputs, tier: 'basic' })
  })
})
