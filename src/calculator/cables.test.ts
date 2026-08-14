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
    expect(qtyOf(planCat6(24, 0), 'cat6_0m5')).toBe(26)
  })

  // The sheet drives this line off Z25 + 2, and Z25 sums every port in the
  // rack — PDU, Mac mini and the Kisi rows included. None of those take a 1'
  // cable: INVENTORY MASTER scopes this one "for switch" and serves the Mac
  // mini and PDU off the 3' line, Kisi off the 10'. An 8-court Autonomous
  // venue is where the two diverge — Z25 = 28 there, so Z25 + 2 would order 30.
  it('sizes the 0.5M off switch ports only, not the sheet\'s Z25', () => {
    expect(qtyOf(planCat6(24, 4), 'cat6_0m5')).toBe(26)
  })

  it('gives 2 of the 1M, PH-bumped from 1 for field spare', () => {
    expect(qtyOf(planCat6(24, 0), 'cat6_1m')).toBe(2)
  })

  it('gives 2 of the 3M on a venue with no Kisi doors', () => {
    expect(qtyOf(planCat6(24, 0), 'cat6_3m')).toBe(2)
  })

  // INVENTORY MASTER calls the 3M "10' patch cable for Kisi", but the sheet's
  // F12 is hardcoded to 1 whatever the door count, so it under-orders every
  // multi-door venue. One run per door, plus the PH spare.
  it('adds one 3M per Kisi door, which the sheet\'s fixed F12 does not', () => {
    expect(qtyOf(planCat6(24, 4), 'cat6_3m')).toBe(6)
  })

  it('names the door count in the 3M formula so the BOM shows its basis', () => {
    const line = planCat6(24, 4).find(l => l.roleKey === 'cat6_3m')
    expect(line?.formula).toContain('4')
  })
})
