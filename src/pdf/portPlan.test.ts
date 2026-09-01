import { describe, it, expect } from 'vitest'
import { buildPortPlan, ipFor, MAX_SECURITY_CAMERAS } from './portPlan'
import type { VenueInputs } from '@/calculator/types'
import type { StoredLine } from '@/data/venueLines'

/** A Pro venue with nothing extra. `over` sets tier, doors, cameras. */
const pro = (courts: number, over: Partial<VenueInputs> = {}): VenueInputs => ({
  courts, tier: 'pro', securityCameras: 0, kisiDoors: 0,
  extendedRetention: false, backupInternet: false, ...over,
})

describe('buildPortPlan outcomes', () => {
  // Basic and Basic+ size no hardware at all, so there is nothing to draw and
  // nothing to explain — a page saying "no port map" for a tier that has no
  // network would be noise on a document handed to someone.
  it('produces no page at all for a tier the gates block', () => {
    const plan = buildPortPlan(pro(8, { tier: 'basic' }), [])
    expect(plan.outcome).toBe('absent')
    expect(plan.reason).toBeNull()
  })

  // planSwitches does not read inputs.tier, so without the gate call a Basic
  // venue returns a perfectly happy 1x 24 plan. This is the regression guard.
  it('asks the gates rather than inferring from the switch plan', () => {
    const plan = buildPortPlan(pro(8, { tier: 'basic_plus' }), [])
    expect(plan.outcome).toBe('absent')
  })

  // A 1-court venue is spec'd with no switch — the gateway powers the court —
  // so there is no switch to make a port template for.
  it('explains a 1-court venue rather than drawing an empty switch', () => {
    const plan = buildPortPlan(pro(1), [])
    expect(plan.outcome).toBe('explained')
    expect(plan.reason).toMatch(/no switch/i)
  })

  it('draws an ordinary Pro venue', () => {
    expect(buildPortPlan(pro(8), []).outcome).toBe('drawn')
  })

  // 32 courts + 32 security cameras is 128 ports, which lands in the 3-switch
  // band. The sizing is correct; the sheet just cannot render three switches.
  //
  // Reached with cameras rather than with 33 courts because the addressing
  // ceiling now claims 33 first, and it must: a court count past 32 is a
  // WRONG drawing, while three switches is merely one this sheet cannot lay
  // out. Ordering them the other way would print colliding IPs.
  it('explains a venue that sizes to more than two switches', () => {
    const plan = buildPortPlan(
      pro(32, { tier: 'autonomous_plus', securityCameras: 32, kisiDoors: 1 }),
      [],
    )
    expect(plan.outcome).toBe('explained')
    expect(plan.reason).toMatch(/three|3 /i)
  })

  // NOT subsumed by the count > 2 branch, though the spec says it is: when
  // planSwitches sets overCapacity it also returns count24: 0, count48: 0, so
  // count > 2 is FALSE and this branch is the only thing catching it. Deleting
  // it leaves 89 courts DRAWN with an empty switch list and all 267 devices
  // silently dropped — a blank port page with no explanation.
  it('explains a venue past the largest sizing band', () => {
    const plan = buildPortPlan(pro(89), [])
    expect(plan.outcome).toBe('explained')
    expect(plan.reason).toMatch(/exceeds the largest sizing band/i)
  })

  it('carries the header summary regardless of outcome', () => {
    const plan = buildPortPlan(pro(8, {
      tier: 'autonomous_plus', securityCameras: 2, kisiDoors: 3,
    }), [])
    expect(plan.summary).toEqual({ courts: 8, securityCameras: 2, kisiDoors: 3 })
  })
})


describe('addressing', () => {
  // As deployed at Tela Park. Do not change these: they are the one half of
  // the plan transcribed from a live venue rather than authored.
  it('keeps the sourced plan byte-for-byte at 8 courts or fewer', () => {
    expect(ipFor('ipad', 1, 8)).toBe('192.168.32.21')
    expect(ipFor('ipad', 8, 8)).toBe('192.168.32.28')
    expect(ipFor('replay', 1, 8)).toBe('192.168.32.31')
    expect(ipFor('replay', 8, 8)).toBe('192.168.32.38')
    expect(ipFor('appletv', 1, 8)).toBe('192.168.32.41')
    expect(ipFor('appletv', 8, 8)).toBe('192.168.32.48')
    expect(ipFor('macmini', 1, 8)).toBe('192.168.32.100')
  })

  // The 10-wide blocks only hold to 8 courts. At 9 the replay and Apple TV
  // blocks move; iPads deliberately do not, so only two of three shift.
  it('switches to the wide blocks at 9 courts', () => {
    expect(ipFor('ipad', 1, 9)).toBe('192.168.32.21')
    expect(ipFor('replay', 1, 9)).toBe('192.168.32.121')
    expect(ipFor('appletv', 1, 9)).toBe('192.168.32.161')
  })

  // The defect this whole plan exists to remove: at 11 courts the old scheme
  // put iPad C11 and replay camera C1 both on .31.
  it('never collides at 14 courts, where the old scheme printed 8 duplicates', () => {
    const seen = new Set<string>()
    for (let n = 1; n <= 14; n++) {
      for (const kind of ['ipad', 'replay', 'appletv'] as const) {
        const ip = ipFor(kind, n, 14)
        expect(seen.has(ip)).toBe(false)
        seen.add(ip)
      }
    }
    expect(seen.has('192.168.32.100')).toBe(false)
  })

  it('never collides or reaches the Mac mini at the 32-court ceiling', () => {
    const seen = new Set<string>()
    for (let n = 1; n <= 32; n++) {
      for (const kind of ['ipad', 'replay', 'appletv'] as const) {
        const ip = ipFor(kind, n, 32)
        expect(seen.has(ip)).toBe(false)
        expect(Number(ip.split('.')[3])).toBeLessThanOrEqual(192)
        seen.add(ip)
      }
    }
    expect(seen.has('192.168.32.100')).toBe(false)
  })

  // Surveillance and access control derive from REPLAY as N-1 and N+1, so the
  // three cannot drift apart.
  it('addresses surveillance and access control off the derived nets', () => {
    expect(ipFor('security', 1, 8)).toBe('192.168.31.21')
    expect(ipFor('nvr', 1, 8)).toBe('192.168.31.100')
    expect(ipFor('controller', 1, 8)).toBe('192.168.33.11')
    expect(ipFor('reader', 1, 8)).toBe('192.168.33.21')
  })

  // The CLI put the controller at .10 and readers at .11+, so a second
  // controller either collided with reader 1 or shifted every reader.
  it('keeps controllers in their own block so a second never shifts a reader', () => {
    expect(ipFor('controller', 2, 8)).toBe('192.168.33.12')
    expect(ipFor('reader', 1, 8)).toBe('192.168.33.21')
  })

  it('bounds the camera block below the NVR reservation', () => {
    expect(MAX_SECURITY_CAMERAS).toBe(79)
    expect(ipFor('security', 79, 8)).toBe('192.168.31.99')
    expect(ipFor('nvr', 1, 8)).toBe('192.168.31.100')
  })

  // FIXTURE TRAP: use 2 courts, not 8. At 8 courts, 80 cameras is 104 ports,
  // which lands in the 3-switch band and returns the SWITCHES reason — the
  // camera branch never runs and the test passes for the wrong reason. At
  // 2 courts it is 86 ports, a 2x48 plan, which reaches the camera check.
  it('explains rather than addressing past the camera block', () => {
    const plan = buildPortPlan(pro(2, {
      tier: 'autonomous_plus', securityCameras: 80, kisiDoors: 1,
    }), [])
    expect(plan.outcome).toBe('explained')
    expect(plan.reason).toMatch(/camera/i)
  })
})

const auto = (courts: number, doors: number, over: Partial<VenueInputs> = {}) =>
  pro(courts, { tier: 'autonomous', kisiDoors: doors, ...over })

/** The labels on the gateway's numbered RJ45 slots, in slot order. */
const slotLabels = (plan: ReturnType<typeof buildPortPlan>) =>
  plan.gateway!.ports
    .filter(p => typeof p.slot === 'number')
    .map(p => p.label)

describe('gateway panel', () => {
  // pickGateway returns the SE only for a Kisi venue or a 1-court venue, so
  // every ordinary Pro venue is on a UDM-Pro. The CLI hardcodes "UDM-SE".
  it('names the model pickGateway chose, not a hardcoded one', () => {
    expect(buildPortPlan(pro(8), []).gateway!.roleKey).toBe('gateway_udm_pro')
    expect(buildPortPlan(auto(8, 2), []).gateway!.roleKey).toBe('gateway_udm_se')
  })

  it('always puts the Mac mini on slot 1', () => {
    const plan = buildPortPlan(pro(8), [])
    const one = plan.gateway!.ports.find(p => p.slot === 1)!
    expect(one.label).toBe('Mac Mini')
    expect(one.ip).toBe('192.168.32.100')
  })

  // The CLI hardcodes ONE controller on port 2 and ONE reader on port 4.
  // planKisi returns counts: 6 doors is 2 controllers and, with a backup WAN,
  // 4 readers on the gateway with 2 overflowing to the switch.
  it('draws the controller and reader COUNTS planKisi returns', () => {
    const plan = buildPortPlan(auto(8, 6, { backupInternet: true }), [])
    expect(slotLabels(plan)).toEqual([
      'Mac Mini',
      'Kisi Controller 1', 'Kisi Controller 2',
      'Kisi Reader 1', 'Kisi Reader 2', 'Kisi Reader 3', 'Kisi Reader 4',
      'Backup Internet',
    ])
    // On the LAST slot specifically, not merely after the readers. Here the
    // readers happen to fill up to 7 so the two are indistinguishable; at
    // 1 door they are not, and the drawn position moves.
    expect(plan.gateway!.ports.find(p => p.label === 'Backup Internet')!.slot)
      .toBe(8)
  })

  it('keeps the backup WAN on slot 8 when readers do not fill the gateway', () => {
    const plan = buildPortPlan(auto(8, 1, { backupInternet: true }), [])
    expect(plan.gateway!.ports.find(p => p.label === 'Backup Internet')!.slot)
      .toBe(8)
  })

  // Without the backup WAN the same venue keeps one more reader on the gateway.
  it('frees the backup WAN slot for a reader when there is no backup', () => {
    const plan = buildPortPlan(auto(8, 6), [])
    expect(slotLabels(plan)).toEqual([
      'Mac Mini',
      'Kisi Controller 1', 'Kisi Controller 2',
      'Kisi Reader 1', 'Kisi Reader 2', 'Kisi Reader 3', 'Kisi Reader 4',
      'Kisi Reader 5',
    ])
  })

  // KISI_READER_PLACEMENT says to tag each UDM port carrying a READER onto the
  // access control VLAN. Readers only — the sources never say controllers.
  it('tags reader slots with the VLAN NAME, and only readers', () => {
    const plan = buildPortPlan(auto(8, 2), [])
    const byLabel = (l: string) => plan.gateway!.ports.find(p => p.label === l)!
    expect(byLabel('Kisi Reader 1').vlan).toBe('ACCESS CONTROL')
    expect(byLabel('Kisi Controller 1').vlan).toBeNull()
    expect(byLabel('Mac Mini').vlan).toBeNull()
  })

  it('carries the WAN and the SFP uplink outside the numbered slots', () => {
    const plan = buildPortPlan(pro(8), [])
    expect(plan.gateway!.ports.find(p => p.slot === 'wan')!.label)
      .toBe('Main Internet')
    expect(plan.gateway!.ports.find(p => p.slot === 'sfp')!.label)
      .toMatch(/Switch 1/)
  })

  // controllers = ceil(doors/4) is uncapped and kisiDoors has no max on the
  // form. 25 doors with a backup WAN is 1 + 7 + 1 = 9 devices on 8 ports.
  it('explains rather than drawing a 9th port on an 8-port gateway', () => {
    const plan = buildPortPlan(auto(8, 25, { backupInternet: true }), [])
    expect(plan.outcome).toBe('explained')
    expect(plan.reason).toMatch(/gateway/i)
  })

  // 1 court + 2 doors is 7 of 8 — NOT oversubscribed. The 1-court reason wins,
  // and it is the missing switch, not capacity.
  it('explains a 1-court Kisi venue for the missing switch, not capacity', () => {
    const plan = buildPortPlan(auto(1, 2), [])
    expect(plan.outcome).toBe('explained')
    expect(plan.reason).toMatch(/no switch/i)
  })

  // The gateway, not a phantom switch. Before the arithmetic was fixed this
  // read "N readers are sized onto a switch this venue does not have", which
  // described planKisi's bug rather than the venue: nothing is sized onto a
  // switch here, the gateway is simply full. 1 + 3 court + 2 controllers + 8
  // readers = 14 on an 8-port device.
  it('names the gateway shortfall when a switchless venue overflows', () => {
    const plan = buildPortPlan(auto(1, 8), [])
    expect(plan.outcome).toBe('explained')
    expect(plan.reason).toMatch(/14 gateway ports/i)
    expect(plan.reason).not.toMatch(/onto a switch/i)
  })
})

const labelsOf = (sw: { ports: { label: string | null }[] }) =>
  sw.ports.filter(p => p.label !== null).map(p => p.label)

describe('switch assignment', () => {
  it('fills one switch in device order', () => {
    const [sw] = buildPortPlan(pro(8), []).switches
    expect(sw.size).toBe(24)
    expect(sw.ports).toHaveLength(24)
    expect(labelsOf(sw)).toHaveLength(24)
    expect(sw.ports[0].label).toBe('iPad C1')
    expect(sw.ports[8].label).toBe('Replay Cam C1')
    expect(sw.ports[16].label).toBe('Apple TV C1')
    expect(sw.uplink).toBe('gateway')
  })

  it('keeps unassigned ports in the array so the drawing has boxes for them', () => {
    const [sw] = buildPortPlan(pro(4), []).switches
    expect(sw.ports).toHaveLength(24)
    expect(labelsOf(sw)).toHaveLength(12)
    expect(sw.ports[23].label).toBeNull()
    expect(sw.ports[23].colour).toBe('empty')
  })

  // 17 courts is 51 devices: 1x24 + 1x48. The CLI refuses this band outright.
  // Sequential fill, NOT the CLI's group split — iPads and replay together are
  // only 34 devices and would leave switch 1 underfilled.
  it('draws the mixed pair, filling the larger switch first and sequentially', () => {
    const { switches } = buildPortPlan(pro(17), [])
    expect(switches.map(s => s.size)).toEqual([48, 24])
    expect(switches[0].ports[0].label).toBe('iPad C1')
    expect(switches[0].ports[16].label).toBe('iPad C17')
    expect(switches[0].ports[17].label).toBe('Replay Cam C1')
    expect(switches[0].ports[34].label).toBe('Apple TV C1')
    expect(switches[0].ports[47].label).toBe('Apple TV C14')
    expect(labelsOf(switches[1])).toEqual([
      'Apple TV C15', 'Apple TV C16', 'Apple TV C17',
    ])
    expect(switches[1].uplink).toBe('switch-1')
  })

  // The CLI puts 50 devices on a 48-port panel here and numbers past port 48.
  it('never assigns more devices than a switch has ports', () => {
    const { switches } = buildPortPlan(pro(25), [])
    expect(switches.map(s => s.size)).toEqual([48, 48])
    expect(labelsOf(switches[0])).toHaveLength(48)
    expect(labelsOf(switches[1])).toHaveLength(27)
  })

  it('puts security cameras and overflow readers after the court gear', () => {
    const plan = buildPortPlan(pro(8, {
      tier: 'autonomous_plus', securityCameras: 2, kisiDoors: 6,
      backupInternet: true,
    }), [])
    const labels = labelsOf(plan.switches[0])
    expect(labels.slice(24)).toEqual([
      'Security Cam 1', 'Security Cam 2', 'Kisi Reader 5', 'Kisi Reader 6',
    ])
  })

  // Readers are numbered across the whole venue: the 4 on the gateway are
  // 1-4, so the 2 on the switch continue at 5 and 6 with matching addresses.
  it('continues reader numbering from the gateway rather than restarting', () => {
    const plan = buildPortPlan(pro(8, {
      tier: 'autonomous', kisiDoors: 6, backupInternet: true,
    }), [])
    const reader = plan.switches[0].ports.find(p => p.label === 'Kisi Reader 5')!
    expect(reader.ip).toBe('192.168.33.25')
    expect(reader.vlan).toBe('ACCESS CONTROL')
  })

  // USW-24-POE has 24 ports but only 16 PoE. planSwitches picks it only below
  // 4 courts (wantPro fires at courts >= 4), so ports 17-24 are always empty
  // there — the invariant lives in planSwitches, and this notices if it moves.
  it('marks the non-PoE half of the standard 24-port SKU', () => {
    const [sw] = buildPortPlan(pro(2), []).switches
    expect(sw.roleKey).toBe('switch_24_std')
    expect(sw.ports[16].colour).toBe('nonpoe')
    expect(sw.ports[23].colour).toBe('nonpoe')
    expect(sw.ports[16].label).toBeNull()
  })

  it('uses the Pro 24-port SKU once a venue earns it', () => {
    expect(buildPortPlan(pro(4), []).switches[0].roleKey).toBe('switch_24_pro')
  })

  it('fills a 48-port switch exactly at 16 courts', () => {
    const [sw] = buildPortPlan(pro(16), []).switches
    expect(sw.size).toBe(48)
    expect(labelsOf(sw)).toHaveLength(48)
  })

  // The cheap witness for the mixed-pair band: 48 court ports + 1 camera = 49,
  // which is the first port count above a single 48-port switch. gates.ts
  // requires Autonomous+ for a camera and at least one door for the tier.
  it('crosses into the mixed pair at 16 courts plus one camera', () => {
    const plan = buildPortPlan(pro(16, {
      tier: 'autonomous_plus', securityCameras: 1, kisiDoors: 1,
    }), [])
    expect(plan.switches.map(s => s.size)).toEqual([48, 24])
  })

  // podplay-ph-venue-sizing.md calls 8 courts "the exact breaking point":
  // 3 x 8 fills the 24-port switch with zero spare, which is precisely why
  // readers go on the gateway. A full switch here is correct, not an error.
  it('keeps both readers off a switch that 8 courts fills exactly', () => {
    const plan = buildPortPlan(pro(8, { tier: 'autonomous', kisiDoors: 2 }), [])
    expect(plan.switches).toHaveLength(1)
    expect(labelsOf(plan.switches[0])).toHaveLength(24)
    expect(labelsOf(plan.switches[0]).some(l => l!.startsWith('Kisi'))).toBe(false)
  })

  it('draws no Kisi on the switch when every reader fits on the gateway', () => {
    const plan = buildPortPlan(pro(8, { tier: 'autonomous', kisiDoors: 4 }), [])
    expect(labelsOf(plan.switches[0]).some(l => l!.startsWith('Kisi'))).toBe(false)
  })

  it('tags security cameras onto the surveillance VLAN', () => {
    const plan = buildPortPlan(pro(8, {
      tier: 'autonomous_plus', securityCameras: 1, kisiDoors: 1,
    }), [])
    const cam = plan.switches[0].ports.find(p => p.label === 'Security Cam 1')!
    expect(cam.vlan).toBe('SURVEILLANCE')
    expect(cam.ip).toBe('192.168.31.21')
  })
})


const line = (over: Partial<StoredLine> = {}): StoredLine => ({
  id: 'l1', venueId: 'v1', itemId: 'i1', roleKey: 'switch_24_pro', qty: 1,
  originRoleKey: null, sortOrder: 0, source: 'formula', suppressed: false,
  note: null, ...over,
})

describe('notes', () => {
  // A lab-preconfigured venue runs on the 13x block, so the sheet must never
  // present its subnet as settled fact.
  it('always carries the subnet verify line', () => {
    expect(buildPortPlan(pro(8), []).notes.join(' '))
      .toMatch(/verify before labelling/i)
  })

  // Tela Park is 14 courts with 8 equipped. Equipping court 9 moves it to the
  // wide blocks and re-addresses its cameras and Apple TVs.
  it('warns a 9+ court venue that the blocks have moved', () => {
    expect(buildPortPlan(pro(9), []).notes.join(' '))
      .toMatch(/re-addressed/i)
    expect(buildPortPlan(pro(8), []).notes.join(' '))
      .not.toMatch(/re-addressed/i)
  })

  // The NVR is not a BOM line and has no term in totalPorts, but the BOM does
  // buy a DAC per NVR — so its absence is stated, not silent.
  it('states the NVR omission on Autonomous+ and nowhere else', () => {
    const plus = buildPortPlan(pro(8, {
      tier: 'autonomous_plus', securityCameras: 2, kisiDoors: 1,
    }), [])
    expect(plus.notes.join(' ')).toMatch(/UNVR/)

    // A warning telling an Autonomous venue it is missing an NVR is wrong —
    // Autonomous is access control only.
    const autonomous = buildPortPlan(pro(8, { tier: 'autonomous', kisiDoors: 1 }), [])
    expect(autonomous.notes.join(' ')).not.toMatch(/UNVR/)
  })

  it('explains that unassigned ports are not spare capacity', () => {
    expect(buildPortPlan(pro(4), []).notes.join(' '))
      .toMatch(/access-point/i)
  })

  // Spec §11 — an installer following PodPlay's guide will not put readers on
  // the gateway, so a venue that does must say so.
  it('states the Kosmas reader deviation only when readers are on the gateway', () => {
    expect(buildPortPlan(pro(8, { tier: 'autonomous', kisiDoors: 2 }), []).notes.join(' '))
      .toMatch(/Kosmas deviation/)
    expect(buildPortPlan(pro(8), []).notes.join(' '))
      .not.toMatch(/Kosmas deviation/)
  })
})

describe('reconciliation with the saved lines', () => {
  // The hardware list is built from stored lines; the port plan from inputs.
  // mergeRecalculation leaves edited lines untouched, so the two can disagree
  // permanently with nothing on screen saying so.
  it('refuses to draw when the lines name a different switch', () => {
    const plan = buildPortPlan(pro(8), [line({ roleKey: 'switch_48_pro' })])
    expect(plan.outcome).toBe('explained')
    expect(plan.reason).toMatch(/disagree/i)
  })

  it('draws when the lines agree', () => {
    expect(buildPortPlan(pro(8), [line()]).outcome).toBe('drawn')
  })

  // An empty line set is the normal case for a venue that has never been
  // recalculated, and is not a disagreement.
  it('draws when there are no lines at all', () => {
    expect(buildPortPlan(pro(8), []).outcome).toBe('drawn')
  })

  // A suppressed line is not on the venue. Counting it would replace the port
  // page with the disagreement notice forever.
  it('ignores suppressed switch lines', () => {
    const plan = buildPortPlan(pro(8), [
      line(), line({ id: 'l2', roleKey: 'switch_48_pro', suppressed: true }),
    ])
    expect(plan.outcome).toBe('drawn')
  })

  // items.role_key is nullable, and both listLines and exportMaterials handle
  // that case. A null roleKey is not a switch.
  it('ignores lines whose role key is null', () => {
    const plan = buildPortPlan(pro(8), [line(), line({ id: 'l2', roleKey: null })])
    expect(plan.outcome).toBe('drawn')
  })

  // "Remove" on the switch row only sets suppressed, so this is one click away
  // on any venue. An empty line set means "never recalculated" and draws; a
  // list that EXISTS but carries no switch is the contradiction itself, and
  // reading it as the empty case put a 48-port panel on page 2 for a switch
  // page 1 did not list.
  it('refuses to draw when the list exists but its switch was removed', () => {
    const plan = buildPortPlan(pro(8), [
      line({ id: 'ipad', roleKey: 'ipad' }),
      line({ suppressed: true }),
    ])
    expect(plan.outcome).toBe('explained')
    expect(plan.reason).toMatch(/disagree/i)
  })

  // qty is free-typed on the row and this runs before doc.save() with no
  // try/catch above it, so allocating `Array(qty)` from it threw RangeError
  // and took the whole export down — the client-facing hardware list with it.
  // A nonsense qty must still produce a PDF; failing closed to the
  // disagreement notice is the correct outcome, a lost document is not.
  it('survives a negative or fractional qty instead of killing the export', () => {
    // The point of each case is that a PDF still comes out. What it SAYS is
    // secondary: a count of zero or a billion disagrees with the one planned
    // switch, while 1.5 floors to 1 and legitimately matches it.
    for (const qty of [-1, 0, 1e9]) {
      const plan = buildPortPlan(pro(8), [line({ qty })])
      expect(plan.outcome).toBe('explained')
      expect(plan.reason).toMatch(/disagree/i)
    }
    expect(buildPortPlan(pro(8), [line({ qty: 1.5 })]).outcome).toBe('drawn')
  })

  // The same guard, from the other side: a TBD switch qty contributes zero
  // copies, so it reads as a disagreement rather than as a matching switch.
  it('treats a TBD switch quantity as a disagreement, not a match', () => {
    const plan = buildPortPlan(pro(8), [line({ qty: 'TBD' })])
    expect(plan.outcome).toBe('explained')
  })
})

// port-template.js:67 has carried this bound since the CLI was written; the
// app relied on the two-switch limit stopping at 96 ports / 3 per court = 32
// courts by coincidence. Stating it means moving the render limit can no
// longer silently move the addressing past where the doc defines it.
describe('the addressing ceiling', () => {
  // 32 courts is 96 ports — two switches, and the last court count the § IP
  // addressing table covers. It must still draw.
  it('still draws at 32 courts, the last count the doc addresses', () => {
    expect(buildPortPlan(pro(32), []).outcome).toBe('drawn')
  })

  // At 33 courts the wide blocks are 40 apart but the venue is not: replay
  // C41 and Apple TV C1 would both be .161. Unreachable today only because
  // three switches bail out first — a coincidence, not a guarantee.
  it('explains above 32 rather than emitting colliding addresses', () => {
    const plan = buildPortPlan(pro(33), [])
    expect(plan.outcome).toBe('explained')
    expect(plan.reason).toMatch(/addressing/i)
  })
})
