import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VenueInputsForm } from './VenueInputsForm'
import type { VenueInputs } from '@/calculator/types'

const inputs: VenueInputs = {
  courts: 8, tier: 'pro', securityCameras: 0,
  kisiDoors: 0, extendedRetention: false,
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

const cameras = () => screen.getByLabelText('Security cameras') as HTMLInputElement
const doors = () => screen.getByLabelText('Kisi doors') as HTMLInputElement

// Before this, both counts were editable on every tier and you only learned the
// tier was wrong when the calculation blocked. Disabling them moves the rule to
// the point of entry, where it reads as a property of the tier rather than an
// error you caused.
describe('VenueInputsForm tier-gated inputs', () => {
  it('lets Autonomous+ edit both counts, being the only tier that carries both', () => {
    render(<VenueInputsForm value={{ ...inputs, tier: 'autonomous_plus' }} onChange={vi.fn()} />)
    expect(cameras().disabled).toBe(false)
    expect(doors().disabled).toBe(false)
  })

  it('lets Autonomous edit doors but not cameras, which is the boundary between the two tiers', () => {
    render(<VenueInputsForm value={{ ...inputs, tier: 'autonomous' }} onChange={vi.fn()} />)
    expect(doors().disabled).toBe(false)
    expect(cameras().disabled).toBe(true)
  })

  it.each(['basic', 'basic_plus', 'pro'] as const)('disables both counts on %s', tier => {
    render(<VenueInputsForm value={{ ...inputs, tier }} onChange={vi.fn()} />)
    expect(cameras().disabled).toBe(true)
    expect(doors().disabled).toBe(true)
  })

  it('says why a disabled input is disabled, so it does not just look broken', () => {
    render(<VenueInputsForm value={{ ...inputs, tier: 'pro' }} onChange={vi.fn()} />)
    expect(cameras()).toHaveAccessibleDescription(/Autonomous\+/)
    expect(doors()).toHaveAccessibleDescription(/Autonomous/)
  })

  // A disabled field still showing "4" would leave the venue blocked on a value
  // there is no longer any control able to clear. Zeroing travels in the same
  // update as the tier so the two can never be saved out of step.
  it('clears both counts when the new tier allows neither', () => {
    const onChange = vi.fn()
    const full = { ...inputs, tier: 'autonomous_plus' as const, securityCameras: 6, kisiDoors: 3 }
    render(<VenueInputsForm value={full} onChange={onChange} />)
    fireEvent.change(tierSelect(), { target: { value: 'pro' } })
    expect(onChange).toHaveBeenCalledWith({
      ...full, tier: 'pro', securityCameras: 0, kisiDoors: 0,
    })
  })

  // Autonomous keeps its doors — dropping them would force a re-entry the tier
  // change never implied, and Autonomous requires at least one door anyway.
  it('clears only the cameras when stepping Autonomous+ down to Autonomous', () => {
    const onChange = vi.fn()
    const full = { ...inputs, tier: 'autonomous_plus' as const, securityCameras: 6, kisiDoors: 3 }
    render(<VenueInputsForm value={full} onChange={onChange} />)
    fireEvent.change(tierSelect(), { target: { value: 'autonomous' } })
    expect(onChange).toHaveBeenCalledWith({
      ...full, tier: 'autonomous', securityCameras: 0, kisiDoors: 3,
    })
  })

  it('leaves counts alone when the new tier still permits them', () => {
    const onChange = vi.fn()
    const full = { ...inputs, tier: 'autonomous' as const, kisiDoors: 3 }
    render(<VenueInputsForm value={full} onChange={onChange} />)
    fireEvent.change(tierSelect(), { target: { value: 'autonomous_plus' } })
    expect(onChange).toHaveBeenCalledWith({ ...full, tier: 'autonomous_plus', kisiDoors: 3 })
  })
})
