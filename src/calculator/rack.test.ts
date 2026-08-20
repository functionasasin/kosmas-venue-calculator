import { describe, it, expect } from 'vitest'
import { sumRackU, pickRack, ISP_MODEM_U } from './rack'
import type { Item, CalculatedLine } from './types'

const item = (roleKey: string, rackU: number | null): Item => ({
  id: roleKey, name: roleKey, category: 'test', roleKey: roleKey as never,
  supplier: null, poeWatts: null, mainsWatts: null, rackU,
  isActive: true, notes: null, printNote: null,
})

describe('sumRackU', () => {
  it('includes a 1U allowance for the ISP modem, which uses rack space but is not purchased', () => {
    expect(ISP_MODEM_U).toBe(1)
    expect(sumRackU([], [])).toBe(1)
  })

  it('multiplies each line by its item rack U', () => {
    const lines: CalculatedLine[] = [
      { roleKey: 'patch_panel_24', qty: 2, formula: '' },
    ]
    expect(sumRackU(lines, [item('patch_panel_24', 1)])).toBe(1 + 2)
  })

  it('counts the Mac mini shelf as 2U and the mini itself as 0, never 3 combined', () => {
    const lines: CalculatedLine[] = [
      { roleKey: 'mac_mini', qty: 1, formula: '' },
      { roleKey: 'mac_mini_shelf', qty: 1, formula: '' },
    ]
    const catalog = [item('mac_mini', 0), item('mac_mini_shelf', 2)]
    expect(sumRackU(lines, catalog)).toBe(1 + 2)
  })

  it('ignores TBD quantities, which have no countable height', () => {
    const lines: CalculatedLine[] = [
      { roleKey: 'access_point', qty: 'TBD', formula: '' },
    ]
    expect(sumRackU(lines, [item('access_point', 1)])).toBe(1)
  })
})

describe('pickRack', () => {
  it('gives a 12U rack up to 10U of gear', () => {
    expect(pickRack(8).roleKey).toBe('rack_12u')
    expect(pickRack(10).roleKey).toBe('rack_12u')
  })

  it('gives 16U from 11 to 14', () => {
    expect(pickRack(11).roleKey).toBe('rack_16u')
    expect(pickRack(14).roleKey).toBe('rack_16u')
  })

  it('gives 21U from 15 to 18', () => {
    expect(pickRack(15).roleKey).toBe('rack_21u')
    expect(pickRack(18).roleKey).toBe('rack_21u')
  })

  it('resolves exactly 19U to 21U, the overlap the doc flagged for this tool', () => {
    expect(pickRack(19).roleKey).toBe('rack_21u')
  })

  it('gives 27U from 20 to 25', () => {
    expect(pickRack(20).roleKey).toBe('rack_27u')
    expect(pickRack(25).roleKey).toBe('rack_27u')
  })

  it('flags above 25U, which the doc table does not cover', () => {
    const r = pickRack(26)
    expect(r.roleKey).toBe('rack_27u')
    expect(r.over25).toBe(true)
  })
})
