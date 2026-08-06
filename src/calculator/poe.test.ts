import { describe, it, expect } from 'vitest'
import { checkPoeBudget } from './poe'
import type { Item, CalculatedLine } from './types'
import type { SwitchPlan } from './network'

const item = (roleKey: string, poeWatts: number | null): Item => ({
  id: roleKey, name: roleKey, category: 'test', roleKey: roleKey as never,
  supplier: null, poeWatts, rackU: null, unitPrice: null, currency: null,
  isActive: true, notes: null, printNote: null,
})

const plan48: SwitchPlan = {
  count24: 0, count48: 1, roleKey24: 'switch_24_pro', overCapacity: false,
}

const lines = (adapterQty: number): CalculatedLine[] => [
  { roleKey: 'replay_camera', qty: 14, formula: '' },
  { roleKey: 'ipad_poe_adapter', qty: adapterQty, formula: '' },
]

describe('checkPoeBudget', () => {
  it('stays informational for the doc\'s densest blessed config (14 courts, 427W of 600W)', () => {
    const catalog = [item('replay_camera', 17.5), item('ipad_poe_adapter', 13)]
    const w = checkPoeBudget(lines(14), catalog, plan48)
    expect(w[0].level).toBe('info')
    expect(w[0].message).toContain('71%')
  })

  it('goes critical with 25W adapters, which the doc explicitly forbids at this density', () => {
    const catalog = [item('replay_camera', 17.5), item('ipad_poe_adapter', 25)]
    const w = checkPoeBudget(lines(14), catalog, plan48)
    expect(w[0].level).toBe('critical')
  })

  it('warns in the 80-90% band', () => {
    const catalog = [item('replay_camera', 30), item('ipad_poe_adapter', 5)]
    // 14*30 + 14*5 = 490 of 600 = 81.7%
    const w = checkPoeBudget(lines(14), catalog, plan48)
    expect(w[0].level).toBe('warn')
  })

  it('says the budget is pooled, because a mixed-switch venue could hide a per-switch overload', () => {
    const catalog = [item('replay_camera', 17.5), item('ipad_poe_adapter', 13)]
    const mixed: SwitchPlan = { ...plan48, count24: 1 }
    const w = checkPoeBudget(lines(14), catalog, mixed)
    expect(w[0].message).toMatch(/pooled/i)
  })

  // A 1-court venue is spec'd with no switch, so the switch budget is 0.
  // Skipping the check there would leave the tightest configuration in the
  // lineup unchecked: its gear runs on the UDM-SE's own 180W, which a single
  // camera plus one iPad adapter already fills ~17% of. The gateway PoE the
  // sizing doc tells us to ignore in a switched venue is the entire budget here.
  it('falls back to the gateway 180W budget on a switchless 1-court venue rather than skipping the check', () => {
    const catalog = [
      item('replay_camera', 17.5), item('ipad_poe_adapter', 13),
    ]
    const none: SwitchPlan = {
      count24: 0, count48: 0, roleKey24: 'switch_24_pro', overCapacity: false,
    }
    const oneCourt: CalculatedLine[] = [
      { roleKey: 'replay_camera', qty: 1, formula: '' },
      { roleKey: 'ipad_poe_adapter', qty: 1, formula: '' },
    ]
    const w = checkPoeBudget(oneCourt, catalog, none)
    expect(w).not.toHaveLength(0)
    // 30.5W of 180W = 17% — informational, but reported.
    expect(w[0].level).toBe('info')
    expect(w[0].message).toMatch(/180/)
  })

  it('goes critical on a 1-court venue that overloads the gateway, which the old zero-budget guard hid', () => {
    const catalog = [item('replay_camera', 17.5), item('ipad_poe_adapter', 25)]
    const none: SwitchPlan = {
      count24: 0, count48: 0, roleKey24: 'switch_24_pro', overCapacity: false,
    }
    const overloaded: CalculatedLine[] = [
      { roleKey: 'replay_camera', qty: 4, formula: '' },
      { roleKey: 'ipad_poe_adapter', qty: 4, formula: '' },
    ]
    // 4*17.5 + 4*25 = 170 of 180 = 94%
    expect(checkPoeBudget(overloaded, catalog, none)[0].level).toBe('critical')
  })
})
