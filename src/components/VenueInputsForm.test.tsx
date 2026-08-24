import type { ComponentProps } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { VenueInputsForm } from './VenueInputsForm'
import type { VenueInputs, Item } from '@/calculator/types'
import { testCatalog } from '@/calculator/testCatalog'

const inputs: VenueInputs = {
  courts: 8, tier: 'pro', securityCameras: 0,
  kisiDoors: 0, extendedRetention: false, backupInternet: false,
}

// Every render goes through here. The catalog props are required, so a helper
// is what keeps 13 call sites from each having to restate "this test is not
// about hardware choices". Optional defaults on the component itself would be
// the other way to do it, and worse: VenueDetail could then ship passing no
// catalog at all and nothing would say so.
const renderForm = (props: Partial<ComponentProps<typeof VenueInputsForm>> = {}) =>
  render(
    <VenueInputsForm
      value={inputs} onChange={vi.fn()}
      catalog={[]} chosen={new Map()} onPick={vi.fn()}
      {...props}
    />,
  )

const tierSelect = () => screen.getByLabelText('Tier') as HTMLSelectElement
const optionsOf = (s: HTMLSelectElement) =>
  [...s.options].map(o => ({ value: o.value, label: o.textContent }))

describe('VenueInputsForm tier picker', () => {
  // The dropdown is the only place a tier is ever set, so it is the app's
  // working definition of the lineup. tiers-reference.md § lineup confirmed
  // 2026-08-11: five tiers, ladder order, Pro+ removed and Basic live.
  it('offers exactly the five live tiers, in ladder order, labelled for humans', () => {
    renderForm({ value: inputs, onChange: vi.fn() })
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
    renderForm({ value: inputs, onChange: vi.fn() })
    expect(optionsOf(tierSelect()).some(o => /pro_plus|Pro\+/.test(o.value + o.label)))
      .toBe(false)
  })

  // Guards the silent failure a stale stored tier causes: a <select> whose
  // value matches no option renders as though a different tier were current.
  it('shows the venue\'s own tier as selected', () => {
    renderForm({ value: { ...inputs, tier: 'autonomous_plus' }, onChange: vi.fn() })
    expect(tierSelect().value).toBe('autonomous_plus')
  })

  it('reports the chosen tier by its stored key, not its label', () => {
    const onChange = vi.fn()
    renderForm({ value: inputs, onChange })
    fireEvent.change(tierSelect(), { target: { value: 'basic' } })
    expect(onChange).toHaveBeenCalledWith({ ...inputs, tier: 'basic' })
  })
})

const cameras = () => screen.getByLabelText('Security cameras') as HTMLInputElement
const doors = () => screen.getByLabelText('Kisi doors') as HTMLInputElement
// By role, not by label: Radix renders a hidden native input beside the
// checkbox button, so getByLabelText matches two elements.
const backupWan = () =>
  screen.getByRole('checkbox', { name: 'Backup internet (WAN)' }) as HTMLButtonElement

// Before this, both counts were editable on every tier and you only learned the
// tier was wrong when the calculation blocked. Disabling them moves the rule to
// the point of entry, where it reads as a property of the tier rather than an
// error you caused.
describe('VenueInputsForm tier-gated inputs', () => {
  it('lets Autonomous+ edit both counts, being the only tier that carries both', () => {
    renderForm({ value: { ...inputs, tier: 'autonomous_plus' }, onChange: vi.fn() })
    expect(cameras().disabled).toBe(false)
    expect(doors().disabled).toBe(false)
  })

  it('lets Autonomous edit doors but not cameras, which is the boundary between the two tiers', () => {
    renderForm({ value: { ...inputs, tier: 'autonomous' }, onChange: vi.fn() })
    expect(doors().disabled).toBe(false)
    expect(cameras().disabled).toBe(true)
  })

  it.each(['basic', 'basic_plus', 'pro'] as const)('disables both counts on %s', tier => {
    renderForm({ value: { ...inputs, tier }, onChange: vi.fn() })
    expect(cameras().disabled).toBe(true)
    expect(doors().disabled).toBe(true)
  })

  it('says why a disabled input is disabled, so it does not just look broken', () => {
    renderForm({ value: { ...inputs, tier: 'pro' }, onChange: vi.fn() })
    expect(cameras()).toHaveAccessibleDescription(/Autonomous\+/)
    expect(doors()).toHaveAccessibleDescription(/Autonomous/)
  })

  // The backup WAN costs one of the UDM's 8 RJ45 ports, which is one fewer for
  // a Kisi reader — so it changes an output on the Kisi tiers and nowhere
  // else. Offering it on Pro would be a control that silently does nothing.
  it('offers the backup WAN on the Kisi tiers only', () => {
    const auto = renderForm({ value: { ...inputs, tier: 'autonomous' }, onChange: vi.fn() })
    // Base UI marks the checkbox disabled with `data-disabled`, not the native
    // attribute — the same way the extended-retention checkbox beside it does.
    expect(backupWan()).not.toHaveAttribute('data-disabled')
    auto.unmount()

    renderForm({ value: { ...inputs, tier: 'pro' }, onChange: vi.fn() })
    expect(backupWan()).toHaveAttribute('data-disabled')
    expect(backupWan()).toHaveAccessibleDescription(/Autonomous/)
  })

  // A disabled field still showing "4" would leave the venue blocked on a value
  // there is no longer any control able to clear. Zeroing travels in the same
  // update as the tier so the two can never be saved out of step.
  it('clears both counts when the new tier allows neither', () => {
    const onChange = vi.fn()
    const full = { ...inputs, tier: 'autonomous_plus' as const, securityCameras: 6, kisiDoors: 3 }
    renderForm({ value: full, onChange })
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
    renderForm({ value: full, onChange })
    fireEvent.change(tierSelect(), { target: { value: 'autonomous' } })
    expect(onChange).toHaveBeenCalledWith({
      ...full, tier: 'autonomous', securityCameras: 0, kisiDoors: 3,
    })
  })

  it('leaves counts alone when the new tier still permits them', () => {
    const onChange = vi.fn()
    const full = { ...inputs, tier: 'autonomous' as const, kisiDoors: 3 }
    renderForm({ value: full, onChange })
    fireEvent.change(tierSelect(), { target: { value: 'autonomous_plus' } })
    expect(onChange).toHaveBeenCalledWith({ ...full, tier: 'autonomous_plus', kisiDoors: 3 })
  })
})

const second = (roleKey: string, id: string, name: string): Item => ({
  ...testCatalog.find(i => i.roleKey === roleKey)!,
  id, name, isDefault: false,
})

const twoCameras = [
  ...testCatalog,
  second('replay_camera', 'dah', 'Dahua 5459T'),
]
const univiewId = testCatalog.find(i => i.roleKey === 'replay_camera')!.id

// The swap picker on the materials table is a Base UI Select, not a native
// <select>: the trigger is a button and the options exist only inside a
// portal while the popup is open, so a pick is driven the way a user performs
// one — open, then mousemove+click the item — rather than by firing `change`
// at the element. See src/components/MaterialsTable.test.tsx for the same
// sequence against the swap picker.
const openPicker = (label: string) => {
  fireEvent.click(screen.getByLabelText(label))
  const popup = document.querySelector('[data-slot="select-content"]')
  if (!popup) throw new Error('picker did not open')
  return within(popup as HTMLElement)
}

describe('VenueInputsForm hardware pickers', () => {
  // The catalog's state today: one active item per role. A "Hardware" group
  // offering a choice of one is worse than no group at all.
  it('renders nothing when no role has a second active item', () => {
    renderForm({ catalog: testCatalog, chosen: new Map([['replay_camera', univiewId]]) })
    expect(screen.queryByText('Hardware')).not.toBeInTheDocument()
  })

  it('renders one picker per role that has a real choice', () => {
    renderForm({ catalog: twoCameras, chosen: new Map([['replay_camera', univiewId]]) })
    expect(screen.getByText('Hardware')).toBeInTheDocument()
    expect(screen.getByLabelText('Replay camera')).toBeInTheDocument()
    // Not one per role key — only the contested one.
    expect(screen.queryByLabelText('Display')).not.toBeInTheDocument()
  })

  // The item the venue is actually sized against has to be what the control
  // shows, or the form quietly reports a different camera than the one driving
  // the UPS rung — the same class of failure as a tier <select> whose value
  // matches no option.
  it('shows the resolved item as selected', () => {
    renderForm({ catalog: twoCameras, chosen: new Map([['replay_camera', 'dah']]) })
    expect(screen.getByLabelText('Replay camera')).toHaveTextContent('Dahua 5459T')
  })

  // A picker change is a sizing change, so it must reach VenueDetail's
  // projection — otherwise `dirty` stays false, the unsaved-changes guard does
  // not arm, and the edit is lost on navigate with nothing said.
  it('reports the role and the item when a picker changes', () => {
    const onPick = vi.fn()
    renderForm({
      catalog: twoCameras,
      chosen: new Map([['replay_camera', univiewId]]),
      onPick,
    })
    const option = openPicker('Replay camera').getByRole('option', { name: 'Dahua 5459T' })
    fireEvent.mouseMove(option)
    fireEvent.click(option)
    expect(onPick).toHaveBeenCalledWith('replay_camera', 'dah')
  })
})
