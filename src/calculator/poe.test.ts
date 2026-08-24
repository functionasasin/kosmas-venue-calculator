import { describe, it, expect } from 'vitest'
import { checkPoeBudget } from './poe'
import type { Item, CalculatedLine } from './types'
import type { SwitchPlan } from './network'
import type { KisiPlan } from './kisi'

const noKisi: KisiPlan = {
  controllers: 0, readers: 0, freeUdmPorts: 7,
  readersOnUdm: 0, readersOnSwitch: 0,
}

const item = (roleKey: string, poeWatts: number | null): Item => ({
  id: roleKey, name: roleKey, category: 'test', roleKey: roleKey as never,
  supplier: null, poeWatts, mainsWatts: null, rackU: null,
  isActive: true, isDefault: true, notes: null, printNote: null,
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
    const w = checkPoeBudget(lines(14), catalog, plan48, noKisi)
    expect(w[0].level).toBe('info')
    expect(w[0].message).toContain('71%')
  })

  it('goes critical with 25W adapters, which the doc explicitly forbids at this density', () => {
    const catalog = [item('replay_camera', 17.5), item('ipad_poe_adapter', 25)]
    const w = checkPoeBudget(lines(14), catalog, plan48, noKisi)
    expect(w[0].level).toBe('critical')
  })

  it('warns in the 80-90% band', () => {
    const catalog = [item('replay_camera', 30), item('ipad_poe_adapter', 5)]
    // 14*30 + 14*5 = 490 of 600 = 81.7%
    const w = checkPoeBudget(lines(14), catalog, plan48, noKisi)
    expect(w[0].level).toBe('warn')
  })

  it('says the budget is pooled, because a mixed-switch venue could hide a per-switch overload', () => {
    const catalog = [item('replay_camera', 17.5), item('ipad_poe_adapter', 13)]
    const mixed: SwitchPlan = { ...plan48, count24: 1 }
    const w = checkPoeBudget(lines(14), catalog, mixed, noKisi)
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
    const w = checkPoeBudget(oneCourt, catalog, none, noKisi)
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
    expect(checkPoeBudget(overloaded, catalog, none, noKisi)[0].level).toBe('critical')
  })

  // Readers are one BOM line because they are one SKU, but they do not all
  // draw from the same supply: the ones on the UDM-SE run off the gateway's
  // own 180W. Charging the whole line to the switch would overstate switch
  // load and could push a venue into a warn band it is not actually in.
  it('keeps UDM-hosted readers off the switch budget', () => {
    const catalog = [item('replay_camera', 17.5), item('kisi_reader', 7)]
    const withReaders: CalculatedLine[] = [
      { roleKey: 'replay_camera', qty: 14, formula: '' },
      { roleKey: 'kisi_reader', qty: 4, formula: '' },
    ]
    const allOnUdm: KisiPlan = {
      controllers: 1, readers: 4, freeUdmPorts: 6,
      readersOnUdm: 4, readersOnSwitch: 0,
    }
    // 14*17.5 = 245 on the switch; the 4 readers' 28W sits on the gateway.
    const w = checkPoeBudget(withReaders, catalog, plan48, allOnUdm)
    expect(w[0].message).toContain('245W of 600W')
    expect(w[0].message).toMatch(/28W of Kisi readers/)
  })

  it('charges overflowed readers to the switch, since that is where they draw', () => {
    const catalog = [item('replay_camera', 17.5), item('kisi_reader', 7)]
    const withReaders: CalculatedLine[] = [
      { roleKey: 'replay_camera', qty: 14, formula: '' },
      { roleKey: 'kisi_reader', qty: 6, formula: '' },
    ]
    const split: KisiPlan = {
      controllers: 2, readers: 6, freeUdmPorts: 5,
      readersOnUdm: 5, readersOnSwitch: 1,
    }
    // 245 + one reader's 7W on the switch; the other five on the gateway.
    expect(checkPoeBudget(withReaders, catalog, plan48, split)[0].message)
      .toContain('252W of 600W')
  })

  // The switchless venue has nothing to split: the gateway budget is already
  // the one being measured, so subtracting gateway load would double-discount.
  it('counts UDM readers normally when the gateway IS the budget', () => {
    const catalog = [item('kisi_reader', 7)]
    const none: SwitchPlan = {
      count24: 0, count48: 0, roleKey24: 'switch_24_pro', overCapacity: false,
    }
    const onUdm: KisiPlan = {
      controllers: 1, readers: 2, freeUdmPorts: 6,
      readersOnUdm: 2, readersOnSwitch: 0,
    }
    const w = checkPoeBudget(
      [{ roleKey: 'kisi_reader', qty: 2, formula: '' }], catalog, none, onUdm,
    )
    expect(w[0].message).toContain('14W of 180W')
  })
})

describe('the non-Pro 24-port switch has a quarter of the Pro\'s budget', () => {
  // USW-24-POE delivers 95W; USW-Pro-24-POE delivers 400W. Both are "a 24-port
  // switch" and the sizing doc's quantity table treats them interchangeably,
  // which is exactly why applying one budget to both went unnoticed: it is
  // wrong only on the 2-3 court venues nobody looks at.
  const plan = (roleKey24: SwitchPlan['roleKey24']): SwitchPlan =>
    ({ count24: 1, count48: 0, roleKey24, overCapacity: false })

  const court = [item('replay_camera', 17.5), item('ipad_poe_adapter', 13)]
  const threeCourts: CalculatedLine[] = [
    { roleKey: 'replay_camera', qty: 3, formula: '' },
    { roleKey: 'ipad_poe_adapter', qty: 3, formula: '' },
  ]

  it('reports a 3-court venue on the non-Pro switch as critical, not comfortable', () => {
    const w = checkPoeBudget(threeCourts, court, plan('switch_24_std'), noKisi)[0]
    // 3 x 30.5 = 91.5W of the 95W this switch can actually deliver.
    expect(w.message).toContain('92W of 95W (96%)')
    expect(w.level).toBe('critical')
  })

  it('still reports the Pro switch against 400W', () => {
    const w = checkPoeBudget(threeCourts, court, plan('switch_24_pro'), noKisi)[0]
    expect(w.message).toContain('92W of 400W (23%)')
    expect(w.level).toBe('info')
  })
})
