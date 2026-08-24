import { describe, it, expect } from 'vitest'
import { calculateBOM } from './index'
import { testCatalog } from './testCatalog'
import type { VenueInputs, Qty } from './types'

const pro = (courts: number, over: Partial<VenueInputs> = {}): VenueInputs => ({
  courts, tier: 'pro', securityCameras: 0, kisiDoors: 0,
  extendedRetention: false, backupInternet: false, ...over,
})

const run = (inputs: VenueInputs) => {
  const r = calculateBOM(inputs, testCatalog)
  const qty = (role: string): Qty | undefined =>
    r.lines.find(l => l.roleKey === role)?.qty
  const codes = r.warnings.map(w => w.code)
  return { ...r, qty, codes }
}

// venue-sizing.md § Worked examples — these four are the doc's own reference
// outputs. A failure here means the transcription is wrong, not the test.
describe('worked example: 5-court Pro venue', () => {
  const r = run(pro(5))
  it('uses one Pro 24-port switch', () => expect(r.qty('switch_24_pro')).toBe(1))
  it('uses one 24-port patch panel', () => expect(r.qty('patch_panel_24')).toBe(1))
  it('needs 17 of the 0.5M cable (15 ports + 2)', () => expect(r.qty('cat6_0m5')).toBe(17))
  it('needs 2 of the 1M', () => expect(r.qty('cat6_1m')).toBe(2))
  it('needs 2 of the 3M', () => expect(r.qty('cat6_3m')).toBe(2))
  // 5 courts draws 327.5 W, which lands on the 1000 VA rung. Pinning the rung
  // rather than just the quantity is the point — a UPS line that appears with
  // the wrong rating is worse than one that is missing.
  it('uses one 1000 VA UPS', () => expect(r.qty('ups_1000va')).toBe(1))
  it('uses a 12U rack, being well under 10U of gear', () => expect(r.qty('rack_12u')).toBe(1))
  it('uses the 2TB SSD', () => expect(r.qty('replay_ssd_2tb')).toBe(1))
  it('uses 5 iPad PoE adapters', () => expect(r.qty('ipad_poe_adapter')).toBe(5))
  it('uses 12 Flic buttons', () => expect(r.qty('flic')).toBe(12))
})

describe('worked example: 8-court Pro venue', () => {
  const r = run(pro(8))
  it('fits exactly one 24-port switch at 24 ports', () => expect(r.qty('switch_24_pro')).toBe(1))
  it('needs 26 of the 0.5M cable', () => expect(r.qty('cat6_0m5')).toBe(26))
  it('uses a 12U rack', () => expect(r.qty('rack_12u')).toBe(1))
  it('uses 8 iPad PoE adapters', () => expect(r.qty('ipad_poe_adapter')).toBe(8))
  it('uses 18 Flic buttons', () => expect(r.qty('flic')).toBe(18))
})

describe('worked example: 10-court Pro venue', () => {
  const r = run(pro(10))
  it('crosses to a 48-port switch at 30 ports', () => {
    expect(r.qty('switch_48_pro')).toBe(1)
    expect(r.qty('switch_24_pro')).toBeUndefined()
  })
  it('uses one 48-port patch panel', () => expect(r.qty('patch_panel_48')).toBe(1))
  it('needs 32 of the 0.5M cable', () => expect(r.qty('cat6_0m5')).toBe(32))
  it('uses 22 Flic buttons', () => expect(r.qty('flic')).toBe(22))
})

describe('worked example: 14-court Pro venue', () => {
  const r = run(pro(14))
  it('still fits a single 48-port switch at 42 ports', () => {
    expect(r.qty('switch_48_pro')).toBe(1)
  })
  it('needs 44 of the 0.5M cable', () => expect(r.qty('cat6_0m5')).toBe(44))
  it('still uses a 12U rack — rack U does not scale with courts', () => {
    expect(r.qty('rack_12u')).toBe(1)
  })
  it('uses 30 Flic buttons', () => expect(r.qty('flic')).toBe(30))
  it('reports PoE at 71%, the doc\'s figure for the densest standard config', () => {
    const poe = r.warnings.find(w => w.code === 'POE_BUDGET')
    expect(poe?.message).toContain('71%')
    expect(poe?.level).toBe('info')
  })
})

describe('gates short-circuit the whole calculation', () => {
  it('returns no lines for Basic+ tier', () => {
    const r = run(pro(8, { tier: 'basic_plus' }))
    expect(r.lines).toHaveLength(0)
    expect(r.codes).toContain('TIER_NO_HARDWARE')
  })

  // FENCE_BRACKET_MANUAL existed only to explain the fence bracket's TBD line.
  // Both went on 2026-08-17 when the bracket was folded into the locking wall
  // mount; a warning pointing at a line that is no longer emitted would send the
  // reader looking for a row that cannot appear. perCourt.test.ts guards the
  // line itself, which is what a reintroduction would have to go through.
  it('does not warn about a fence bracket it no longer sizes', () => {
    expect(run(pro(8)).codes).not.toContain('FENCE_BRACKET_MANUAL')
  })
})

describe('edge cases', () => {
  it('gives a 1-court venue a UDM-SE and NO switch', () => {
    const r = run(pro(1))
    expect(r.qty('gateway_udm_se')).toBe(1)
    expect(r.qty('switch_24_pro')).toBeUndefined()
    expect(r.qty('switch_24_std')).toBeUndefined()
    expect(r.qty('switch_48_pro')).toBeUndefined()
  })

  it('errors above the 264-port ceiling and returns no lines', () => {
    const r = run(pro(89))
    expect(r.lines).toHaveLength(0)
    expect(r.codes).toContain('PORT_CEILING')
  })

  it('accepts exactly 264 ports', () => {
    expect(run(pro(88)).codes).not.toContain('PORT_CEILING')
  })

  it('warns about the unmapped role when the catalog lacks an item', () => {
    const thin = testCatalog.filter(i => i.roleKey !== 'ups_1000va')
    const r = calculateBOM(pro(8), thin)
    expect(r.warnings.map(w => w.code)).toContain('UNMAPPED_ROLE')
  })

  it('always emits the access point warning', () => {
    expect(run(pro(8)).codes).toContain('ACCESS_POINTS_MANUAL')
  })
})

// venue-sizing.md § Kisi port accounting. `Cost Analysis!F7` bands switch
// quantity on cameras + iPads + Apple TVs with no Kisi term at all, so the
// sheet sizes an Autonomous venue's switch as if its doors did not exist.
// These are the cases where that silence produces a wrong build.
const auto = (courts: number, kisiDoors: number, backupInternet = false) =>
  run(pro(courts, { tier: 'autonomous', kisiDoors, backupInternet }))

describe('worked example: 8-court Autonomous venue (<=4 doors)', () => {
  const r = auto(8, 4)

  it('keeps the 24-port switch, because the readers go on the UDM-SE', () => {
    expect(r.qty('switch_24_pro')).toBe(1)
    expect(r.qty('switch_48_pro')).toBeUndefined()
  })

  it('needs one 24-port panel', () => expect(r.qty('patch_panel_24')).toBe(1))
  it('needs 26 of the 0.5M — (3 x courts) + 2, not Z25 + 2', () =>
    expect(r.qty('cat6_0m5')).toBe(26))
  it('needs 6 of the 3M — 2 spare plus one run per door', () =>
    expect(r.qty('cat6_3m')).toBe(6))

  it('puts the Kisi kit on the list, since it is what makes the tier', () => {
    expect(r.qty('kisi_controller')).toBe(1)
    expect(r.qty('kisi_reader')).toBe(4)
  })

  it('records the reader placement, which an installer will not infer', () => {
    expect(r.codes).toContain('KISI_READER_PLACEMENT')
  })
})

describe('Kisi doors and switch sizing', () => {
  // 8 courts fills a 24-port switch exactly, so the doc calls it the breaking
  // point: counted PodPlay's way — every reader on the switch — the first door
  // takes the venue to 25 ports and a 48-port switch. Putting readers on the
  // UDM-SE is the whole reason the 24-port build survives.
  it('absorbs the first door at 8 courts instead of jumping to a 48-port', () => {
    expect(auto(8, 1).qty('switch_24_pro')).toBe(1)
  })

  // Controllers eat UDM ports before readers do, so the ceiling is not simply
  // "6 free ports = 6 doors": the 5th door adds a second controller.
  it('still fits 5 doors, where a second controller has taken a UDM port', () => {
    const r = auto(8, 5)
    expect(r.qty('kisi_controller')).toBe(2)
    expect(r.qty('switch_24_pro')).toBe(1)
  })

  it('overflows to a 48-port switch once the UDM-SE is full at 6 doors', () => {
    const r = auto(8, 6)
    expect(r.qty('switch_48_pro')).toBe(1)
    expect(r.qty('switch_24_pro')).toBeUndefined()
    expect(r.qty('patch_panel_48')).toBe(1)
    // 24 court ports + the one reader that did not fit.
    expect(r.qty('cat6_0m5')).toBe(27)
  })

  // The backup WAN takes the eighth UDM port, so a venue that fit yesterday
  // does not fit today. This is the input's entire reason for existing.
  it('changes the switch SKU when a backup WAN takes a UDM port', () => {
    expect(auto(8, 5).qty('switch_24_pro')).toBe(1)
    expect(auto(8, 5, true).qty('switch_48_pro')).toBe(1)
  })

  it('warns that the switch is full when nothing is left spare', () => {
    expect(auto(8, 4).codes).toContain('KISI_SWITCH_HEADROOM')
  })

  it('leaves a Pro venue untouched — no Kisi lines, no Kisi warnings', () => {
    const r = run(pro(8))
    expect(r.qty('kisi_controller')).toBeUndefined()
    expect(r.qty('kisi_reader')).toBeUndefined()
    expect(r.codes).not.toContain('KISI_READER_PLACEMENT')
  })
})

describe('UPS rating', () => {
  // The rung is the whole point of the line — a UPS that appears with the wrong
  // rating is worse than one that is missing, because it looks settled.
  it.each([
    [4, 'ups_750va'], [8, 'ups_1000va'], [12, 'ups_1500va'], [16, 'ups_2000va'],
  ])('a %i-court Pro venue carries %s', (courts, role) => {
    expect(run(pro(courts)).qty(role)).toBe(1)
  })

  it('sizes the UPS before the rack, so its 2U is in the rack total', () => {
    const lines = calculateBOM(pro(8), testCatalog).lines
    const ups = lines.findIndex(l => l.roleKey.startsWith('ups_'))
    const rack = lines.findIndex(l => l.roleKey.startsWith('rack_'))
    expect(ups).toBeGreaterThan(-1)
    expect(ups).toBeLessThan(rack)
  })

  it('warns when past the top of the PH ladder', () => {
    const huge = pro(60, {
      tier: 'autonomous_plus', kisiDoors: 4, securityCameras: 40,
    })
    expect(run(huge).codes).toContain('UPS_OVER_LADDER')
    expect(run(pro(16)).codes).not.toContain('UPS_OVER_LADDER')
  })

  it('warns when the camera count outruns the NVR band table', () => {
    const past = pro(20, {
      tier: 'autonomous_plus', kisiDoors: 4, securityCameras: 61,
    })
    expect(run(past).codes).toContain('UPS_NVR_UNBANDED')
  })
})

describe('the replay camera drives the UPS rung', () => {
  // The camera is not standardised across venues — Tela Park runs the Uniview
  // Owlview at 2.8W, Helios Beta is being built with the Dahua at 17.5W — and
  // at 14 courts that is a full rung. The engine used to WARN about the gap
  // because it could not know which camera a venue had; now the resolved
  // catalog tells it, so the rung itself is the answer and there is nothing to
  // hedge about.
  //
  // Both deltas are the same number by construction — the camera is PoE-only —
  // so 14 x (17.5 - 2.8) = 205.8 W. A revision of these figures that does not
  // satisfy that identity is wrong.
  const withCamera = (poeWatts: number) =>
    testCatalog.map(i => (i.roleKey === 'replay_camera' ? { ...i, poeWatts } : i))

  it('sizes a 14-court Pro venue at 1000 VA on the 2.8 W Uniview', () => {
    const r = calculateBOM(pro(14), withCamera(2.8))
    expect(r.lines.map(l => l.roleKey)).toContain('ups_1000va')
    // 406 W of load, and 221 W of 600 W on the switch — 37%.
    expect(r.lines.find(l => l.roleKey === 'ups_1000va')!.formula)
      .toContain('406 W')
  })

  it('sizes the same venue at 1500 VA on the 17.5 W Dahua', () => {
    const r = calculateBOM(pro(14), withCamera(17.5))
    expect(r.lines.map(l => l.roleKey)).toContain('ups_1500va')
    // 612 W of load, and 427 W of 600 W on the switch — 71%.
    expect(r.lines.find(l => l.roleKey === 'ups_1500va')!.formula)
      .toContain('612 W')
  })

  // The tool no longer guesses which camera a venue gets, so it must no longer
  // say it is guessing.
  it('never raises UPS_CAMERA_ASSUMPTION, whatever the camera', () => {
    for (const w of [2.8, 16, 17.5, 24]) {
      expect(calculateBOM(pro(14), withCamera(w)).warnings.map(x => x.code))
        .not.toContain('UPS_CAMERA_ASSUMPTION')
    }
  })
})
