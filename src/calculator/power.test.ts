import { describe, it, expect } from 'vitest'
import { planUps, UPS_LADDER } from './power'
import { testCatalog } from './testCatalog'
import { planSwitches, totalPorts, pickGateway } from './network'
import { planKisi } from './kisi'
import { planPerCourt } from './perCourt'
import type { VenueInputs, CalculatedLine } from './types'

const base: VenueInputs = {
  courts: 8,
  tier: 'pro',
  securityCameras: 0,
  kisiDoors: 0,
  extendedRetention: false,
  backupInternet: false,
}

/**
 * The UPS load is a property of the whole rack, so it is summed from the lines
 * the rest of the engine emits rather than re-derived from inputs. Rebuilding
 * that line set here — instead of hand-writing one — is what makes these tests
 * fail if a future change moves a device on or off the rack: adding a mains
 * device with no `mainsWatts` would silently drop out of the load otherwise.
 */
function linesFor(inputs: VenueInputs): CalculatedLine[] {
  const kisi = planKisi(inputs)
  const ports = totalPorts(inputs)
  const switches = planSwitches(inputs, ports)
  const lines: CalculatedLine[] = [
    { roleKey: pickGateway(inputs), qty: 1, formula: 'test' },
  ]
  if (switches.count24 > 0) {
    lines.push({ roleKey: switches.roleKey24, qty: switches.count24, formula: 'test' })
  }
  if (switches.count48 > 0) {
    lines.push({ roleKey: 'switch_48_pro', qty: switches.count48, formula: 'test' })
  }
  if (kisi.readers > 0) {
    lines.push({ roleKey: 'kisi_controller', qty: kisi.controllers, formula: 'test' })
    lines.push({ roleKey: 'kisi_reader', qty: kisi.readers, formula: 'test' })
  }
  lines.push(...planPerCourt(inputs))
  return lines
}

const load = (i: Partial<VenueInputs>) => {
  const inputs = { ...base, ...i }
  return planUps(inputs, linesFor(inputs), testCatalog)
}

const pro = (courts: number) => load({ courts })
const auto = (courts: number, kisiDoors = 4) =>
  load({ courts, tier: 'autonomous', kisiDoors })
const autoPlus = (courts: number, kisiDoors = 4) =>
  load({ courts, tier: 'autonomous_plus', kisiDoors, securityCameras: courts })

describe('UPS load — venue-sizing.md § VA sizing by court count', () => {
  // The doc's own worked examples. These are the numbers a human can check by
  // hand against the § Per-line wattages table, so they are pinned exactly
  // rather than as ranges — a drift of even a few watts means a device moved
  // on or off the rack and the whole table needs re-deriving.
  it.each([
    // courts, load W
    [1, 155.5],   // no switch at all — the UDM-SE powers the single court
    [4, 297],
    [5, 327.5],
    [8, 419],
    [10, 490],
    [12, 551],
    [14, 612],    // Helios Beta
    [16, 673],
    [17, 753.5],  // two switches: 1x 24-port + 1x 48-port
  ])('a %i-court Pro venue draws %f W', (courts, watts) => {
    expect(pro(courts).load).toBeCloseTo(watts, 1)
  })

  // venue-sizing.md § The load formula — the fixed term is NOT flat. A 1-court
  // venue is spec'd with no switch, and 17+ courts take two. Hardcoding one
  // switch overstates the small venue by 50% and understates the large one.
  it('charges no switch to a 1-court venue and two to a 17-court one', () => {
    expect(pro(1).load).toBeCloseTo(155.5, 1)   // 30.5 + 125, no switch
    expect(pro(17).load).toBeCloseTo(753.5, 1)  // + 50 + 60 for two switches
  })

  // The 2-3 court venues are the only ones that get the non-Pro USW-24-POE,
  // which draws 25 W rather than the Pro's 50 W. Charging them the Pro figure
  // would overstate the smallest venues by 10% — the same venues where a rung
  // of over-spec is the largest share of the budget.
  it.each([
    [2, 211], [3, 241.5],
  ])('charges a %i-court venue for the non-Pro switch at 25 W', (courts, watts) => {
    expect(pro(courts).load).toBeCloseTo(watts, 1)
  })

  // The Mac mini, gateway and switches draw mains, not PoE. If they were ever
  // read from poeWatts they would contribute 0 and the load would collapse to
  // the court gear alone — which is the failure this whole field exists to
  // prevent. 419 - 244 (court PoE) = 175 W of rack mains + modem.
  it('counts rack mains draw that carries no PoE wattage at all', () => {
    const courtPoe = 8 * (17.5 + 13)
    expect(pro(8).load - courtPoe).toBeCloseTo(175, 1)
  })
})

describe('UPS load — Autonomous adds Kisi', () => {
  it.each([
    [4, 345], [8, 467], [12, 599], [16, 721],
  ])('a %i-court Autonomous venue with 4 doors draws %f W', (courts, watts) => {
    expect(auto(courts).load).toBeCloseTo(watts, 1)
  })

  // venue-sizing.md — the sheet's `T38 = (6*F38)+20` adds 20W once no matter
  // how many doors, but one Controller Pro 2 drives only four. At 8 doors the
  // sheet under-counts by a whole controller.
  it('charges one controller per four doors, not a flat 20 W', () => {
    expect(auto(8, 8).load).toBeCloseTo(525, 1)   // 2 controllers = 40 W
    expect(auto(8, 8).load - auto(8, 4).load).toBeCloseTo(58, 1)
  })
})

describe('UPS load — Autonomous+ adds cameras and the NVR', () => {
  it.each([
    [4, 473], [8, 633], [12, 783], [16, 983],
  ])('a %i-court Autonomous+ venue draws %f W', (courts, watts) => {
    expect(autoPlus(courts).load).toBeCloseTo(watts, 1)
  })

  // The NVR is never a BOM line — it is added by hand — but it is bolted in the
  // rack and drawing from the UPS. Sizing without it understates an Autonomous+
  // venue by a flat 100-160 W, which is a full rung at every court count.
  it('includes the NVR even though no line carries it', () => {
    // Four courts, not eight: security cameras take switch ports, so at 8
    // courts adding 8 cameras crosses 24 ports and swaps the 24-port switch
    // (50 W) for a 48-port (60 W), burying the NVR under a 10 W switch change.
    // At 4 courts both venues sit on the same switch, isolating the NVR.
    const withCams = load({
      courts: 4, tier: 'autonomous_plus', kisiDoors: 4, securityCameras: 4,
    })
    const noCams = auto(4)
    // 4 cameras x 7 W = 28 W of PoE, plus the 100 W UNVR.
    expect(withCams.load - noCams.load).toBeCloseTo(128, 1)
  })

  it('steps the NVR to the UNVR-Pro band above 20 cameras', () => {
    const at20 = load({ courts: 16, tier: 'autonomous_plus', kisiDoors: 4, securityCameras: 20 })
    const at21 = load({ courts: 16, tier: 'autonomous_plus', kisiDoors: 4, securityCameras: 21 })
    // One more camera adds its own 7 W plus the 60 W step from UNVR to UNVR-Pro.
    expect(at21.load - at20.load).toBeCloseTo(67, 1)
  })
})

describe('VA rung selection', () => {
  // venue-sizing.md § The table — required_watts = load / 0.70, then
  // required_VA = required_watts / 0.6, then round UP to a stocked size.
  it('derates to 70% and converts at PF 0.6', () => {
    const r = pro(14)
    expect(r.load).toBeCloseTo(612, 1)
    expect(r.requiredWatts).toBeCloseTo(874.3, 1)
    expect(r.requiredVa).toBeCloseTo(1457.1, 1)
    expect(r.rung).toBe(1500)
  })

  it.each([
    [4, 750], [8, 1000], [12, 1500], [16, 2000],
  ])('a %i-court Pro venue specs %i VA', (courts, rung) => {
    expect(pro(courts).rung).toBe(rung)
  })

  it.each([
    [4, 1000], [8, 1500], [12, 1500], [16, 2000],
  ])('a %i-court Autonomous venue specs %i VA', (courts, rung) => {
    expect(auto(courts).rung).toBe(rung)
  })

  it.each([
    [4, 1500], [8, 2000], [12, 2000], [16, 3000],
  ])('a %i-court Autonomous+ venue specs %i VA', (courts, rung) => {
    expect(autoPlus(courts).rung).toBe(rung)
  })

  it('rounds up to a stocked size rather than reporting the raw figure', () => {
    // 8 courts computes to 997.6 VA — a hair under the rung, and it must not
    // round down to 750 nor report 998 as if it were purchasable.
    expect(pro(8).requiredVa).toBeCloseTo(997.6, 1)
    expect(pro(8).rung).toBe(1000)
  })

  it('emits the rung as a role key the catalog can map', () => {
    expect(pro(14).line.roleKey).toBe('ups_1500va')
    expect(pro(4).line.roleKey).toBe('ups_750va')
    expect(UPS_LADDER.every(v => testCatalog.some(i => i.roleKey === `ups_${v}va`)))
      .toBe(true)
  })

  it('shows the derivation, because a bare VA figure is unauditable', () => {
    expect(pro(14).line.formula).toBe('612 W ÷ 0.70 ÷ PF 0.6 = 1457 VA → 1500 VA')
  })

  it('is one UPS per venue at every size', () => {
    expect(pro(1).line.qty).toBe(1)
    expect(pro(16).line.qty).toBe(1)
  })
})

describe('past the top of the ladder', () => {
  // The doc's ladder stops at 3000 VA. A venue past it is a design decision,
  // not a formula output — but it still needs a line, so it takes the top rung
  // and says so rather than silently emitting a unit that cannot carry it.
  it('caps at the top rung and flags it', () => {
    const huge = load({
      courts: 60, tier: 'autonomous_plus', kisiDoors: 4, securityCameras: 40,
    })
    expect(huge.requiredVa).toBeGreaterThan(3000)
    expect(huge.rung).toBe(3000)
    expect(huge.overLadder).toBe(true)
  })

  it('does not flag a venue that fits', () => {
    expect(pro(16).overLadder).toBe(false)
  })

  // Lists!F44:G52 bands the NVR only to 60 cameras. Past that the doc has no
  // figure, so the load is understated and the caller has to be told.
  it('flags a camera count the NVR band table does not cover', () => {
    const past = load({
      courts: 20, tier: 'autonomous_plus', kisiDoors: 4, securityCameras: 61,
    })
    expect(past.nvrUnbanded).toBe(true)
    expect(autoPlus(16).nvrUnbanded).toBe(false)
  })
})
