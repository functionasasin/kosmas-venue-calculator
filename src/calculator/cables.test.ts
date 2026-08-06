import { describe, it, expect } from 'vitest'
import { planPatchPanels, planCat6 } from './cables'
import type { SwitchPlan } from './network'

const plan = (count24: number, count48: number): SwitchPlan => ({
  count24, count48, roleKey24: 'switch_24_pro', overCapacity: false,
})

const qtyOf = (lines: ReturnType<typeof planPatchPanels>, role: string) =>
  lines.find(l => l.roleKey === role)?.qty

describe('planPatchPanels', () => {
  it('gives one 24-port panel per 24-port switch', () => {
    expect(qtyOf(planPatchPanels(plan(1, 0)), 'patch_panel_24')).toBe(1)
  })

  it('gives one 48-port panel per 48-port switch (PH deviation from 2x24)', () => {
    expect(qtyOf(planPatchPanels(plan(0, 1)), 'patch_panel_48')).toBe(1)
  })

  it('gives BOTH panel types in a mixed band, not one or the other', () => {
    const lines = planPatchPanels(plan(1, 1))
    expect(qtyOf(lines, 'patch_panel_24')).toBe(1)
    expect(qtyOf(lines, 'patch_panel_48')).toBe(1)
  })

  it('scales with multiple 48-port switches rather than staying at 1', () => {
    expect(qtyOf(planPatchPanels(plan(1, 5)), 'patch_panel_48')).toBe(5)
  })

  it('emits nothing when there is no switch, as on a 1-court venue', () => {
    expect(planPatchPanels(plan(0, 0))).toHaveLength(0)
  })
})

describe('planCat6', () => {
  it('gives total ports plus 2 of the 0.5M patch cable', () => {
    expect(qtyOf(planCat6(24), 'cat6_0m5')).toBe(26)
  })

  it('gives 2 of the 1M, PH-bumped from 1 for field spare', () => {
    expect(qtyOf(planCat6(24), 'cat6_1m')).toBe(2)
  })

  it('gives 2 of the 3M, PH-bumped from 1 for field spare', () => {
    expect(qtyOf(planCat6(24), 'cat6_3m')).toBe(2)
  })
})
