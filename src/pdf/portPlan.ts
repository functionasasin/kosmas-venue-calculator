import type { VenueInputs } from '@/calculator/types'
import type { StoredLine } from '@/data/venueLines'
import { evaluateGates } from '@/calculator/gates'
import { planKisi, gatewayPortDemand, UDM_RJ45_PORTS } from '@/calculator/kisi'
import { pickGateway, planSwitches, totalPorts } from '@/calculator/network'

/**
 * Three outcomes, not two. 'absent' is what a blocked tier gets: no page and
 * nothing said, because a venue with no hardware has no ports to explain.
 * 'explained' is a page carrying a reason and no drawing — an unexplained gap
 * in a handed-out document is the failure this file exists to avoid.
 */
export type PortOutcome = 'drawn' | 'explained' | 'absent'

export type DeviceColour =
  | 'ipad' | 'replay' | 'appletv' | 'security' | 'kisi' | 'gateway'
  | 'sfp' | 'empty' | 'nonpoe'

export interface PortAssignment {
  port: number
  /** null when the port is unassigned. */
  label: string | null
  /** Court or device number; null for singletons like the Mac mini. */
  index: number | null
  ip: string | null
  /**
   * VLAN NAME tagged inside the box, e.g. 'ACCESS CONTROL'. A name, never a
   * number: a lab-preconfigured venue runs on the 13x block, and repeating a
   * number in every box is that risk at volume. The verify line owns numbering.
   * null on REPLAY, which is the sheet's default and would be noise everywhere.
   */
  vlan: string | null
  colour: DeviceColour
}

/**
 * The gateway's face is not a uniform numbered strip — it carries RJ45 LAN
 * ports, a WAN port and an SFP+ uplink, and the last two have no RJ45 number.
 */
export interface GatewayPort {
  slot: number | 'wan' | 'sfp'
  label: string | null
  ip: string | null
  vlan: string | null
  colour: DeviceColour
}

export interface GatewayPlanned {
  roleKey: 'gateway_udm_se' | 'gateway_udm_pro'
  ports: GatewayPort[]
}

export interface SwitchPlanned {
  size: 24 | 48
  roleKey: 'switch_24_pro' | 'switch_24_std' | 'switch_48_pro'
  /** length === size, unassigned ports included. */
  ports: PortAssignment[]
  uplink: 'gateway' | 'switch-1'
}

export interface PortPlan {
  outcome: PortOutcome
  /** Set only when outcome is 'explained'; printed verbatim. */
  reason: string | null
  summary: { courts: number; securityCameras: number; kisiDoors: number }
  /**
   * Printed under the legend, in order. A list rather than booleans so a new
   * note needs no new field and the tests can assert on text.
   */
  notes: string[]
  gateway: GatewayPlanned | null
  /** switches[0] is the larger, filled first, drawn topmost, titled Switch 1. */
  switches: SwitchPlanned[]
}

const summaryOf = (inputs: VenueInputs) => ({
  courts: inputs.courts,
  securityCameras: inputs.securityCameras,
  kisiDoors: inputs.kisiDoors,
})

const absent = (inputs: VenueInputs): PortPlan => ({
  outcome: 'absent', reason: null, summary: summaryOf(inputs),
  notes: [], gateway: null, switches: [],
})

const explained = (inputs: VenueInputs, reason: string): PortPlan => ({
  outcome: 'explained', reason, summary: summaryOf(inputs),
  notes: [], gateway: null, switches: [],
})

/**
 * podplay-ph-venue-sizing.md § IP addressing. That document is the authority;
 * this is a transcription. Subnet is fixed at 32 for the app — the lab's .132
 * stays with the standalone CLI, which takes --subnet.
 *
 * Surveillance and access control DERIVE as N-1 and N+1. Writing all three as
 * literals is how they drift apart.
 */
const SUBNET = 32
export const REPLAY_NET = `192.168.${SUBNET}`
export const SURVEILLANCE_NET = `192.168.${SUBNET - 1}`
export const ACCESS_NET = `192.168.${SUBNET + 1}`

/**
 * The camera block runs upward from .21 and the NVR holds .100, so the plan is
 * defined to 79 cameras. Far past anything drawable, but bounded rather than
 * left to collide the way the 10-wide REPLAY blocks were.
 */
export const MAX_SECURITY_CAMERAS = 79

/**
 * port-template.js § MAX_COURTS_ADDRESSED, mirrored here.
 *
 * The wide blocks are 40 apart (replay .120+N, Apple TV .160+N), so they hold
 * to 40 courts — at 41 replay C41 and Apple TV C1 are both .161, which is the
 * § Rules that make the blocks safe collision all over again one block up. The
 * doc's table stops at 32 courts, and the two-switch limit below happens to
 * stop there too (96 ports / 3 per court). This bound is stated rather than
 * left to that coincidence: if the render limit ever moves, the addressing
 * must be extended first.
 */
export const MAX_COURTS_ADDRESSED = 32

/** Courts 1-8 keep the deployed plan; 9+ use the wide blocks. */
const WIDE_FROM = 9

export type AddressKind =
  | 'ipad' | 'replay' | 'appletv' | 'macmini'
  | 'security' | 'nvr' | 'controller' | 'reader'

/**
 * `n` is the device number within its own kind (court number for court gear,
 * reader number across the whole venue for readers). `courts` selects the
 * REPLAY block width and is ignored by the other two networks.
 */
export function ipFor(kind: AddressKind, n: number, courts: number): string {
  const wide = courts >= WIDE_FROM
  switch (kind) {
    case 'ipad':       return `${REPLAY_NET}.${20 + n}`
    case 'replay':     return `${REPLAY_NET}.${(wide ? 120 : 30) + n}`
    case 'appletv':    return `${REPLAY_NET}.${(wide ? 160 : 40) + n}`
    case 'macmini':    return `${REPLAY_NET}.100`
    case 'security':   return `${SURVEILLANCE_NET}.${20 + n}`
    case 'nvr':        return `${SURVEILLANCE_NET}.100`
    case 'controller': return `${ACCESS_NET}.${10 + n}`
    case 'reader':     return `${ACCESS_NET}.${20 + n}`
  }
}

/** The gateway's RJ45 LAN ports. The SFP uplink is not one of them. */
const GATEWAY_RJ45 = 8

/**
 * Slot 1 Mac mini, then controllers, then the readers that fit, with the
 * backup WAN on the last slot. planKisi's own arithmetic already subtracts the
 * Mac mini, the controllers and the backup WAN, so the readers it says fit do
 * fit — but `controllers` is uncapped (ceil(doors/4), and kisiDoors has no
 * maximum on the form), so the total is checked rather than assumed.
 */
function buildGateway(inputs: VenueInputs): GatewayPlanned {
  const kisi = planKisi(inputs)
  const ports: GatewayPort[] = [{
    slot: 1, label: 'Mac Mini', ip: ipFor('macmini', 1, inputs.courts),
    vlan: null, colour: 'gateway',
  }]

  let slot = 2
  for (let n = 1; n <= kisi.controllers; n++) {
    ports.push({
      slot: slot++, label: `Kisi Controller ${n}`,
      ip: ipFor('controller', n, inputs.courts),
      // The sources scope the VLAN instruction to readers. Tagging the
      // controller too would be unsourced.
      vlan: null, colour: 'kisi',
    })
  }
  for (let n = 1; n <= kisi.readersOnUdm; n++) {
    ports.push({
      slot: slot++, label: `Kisi Reader ${n}`,
      ip: ipFor('reader', n, inputs.courts),
      vlan: 'ACCESS CONTROL', colour: 'kisi',
    })
  }
  if (inputs.backupInternet) {
    ports.push({
      slot: GATEWAY_RJ45, label: 'Backup Internet', ip: null,
      vlan: null, colour: 'gateway',
    })
  }

  ports.push({
    slot: 'wan', label: 'Main Internet', ip: null, vlan: null, colour: 'gateway',
  })
  // Always present: a venue with no switch returns 'explained' before this
  // runs, so there is no switchless gateway panel to draw.
  ports.push({
    slot: 'sfp', label: 'SFP DAC to Switch 1', ip: null, vlan: null,
    colour: 'sfp',
  })
  // pickGateway is typed `(inputs) => RoleKey`, the full 40-member union, but
  // the only two values it can return are the gateway keys. Without the cast
  // `npm run build` fails with TS2322 — vitest would not have caught it.
  return { roleKey: pickGateway(inputs) as GatewayPlanned['roleKey'], ports }
}

/** Devices the gateway must physically hold, whether or not they are drawn. */
function gatewayDemand(inputs: VenueInputs): number {
  const kisi = planKisi(inputs)
  return 1 + kisi.controllers + kisi.readersOnUdm
    + (inputs.backupInternet ? 1 : 0)
}

interface Device {
  label: string
  index: number
  ip: string
  vlan: string | null
  colour: DeviceColour
}

/**
 * Fixed device order, then ports fill sequentially and spill onto the next
 * switch when one is full. A group may split across two switches — every box
 * is labelled, so the sheet stays unambiguous.
 */
function devicesFor(inputs: VenueInputs): Device[] {
  const c = inputs.courts
  const out: Device[] = []
  for (let n = 1; n <= c; n++) {
    out.push({ label: `iPad C${n}`, index: n, ip: ipFor('ipad', n, c), vlan: null, colour: 'ipad' })
  }
  for (let n = 1; n <= c; n++) {
    out.push({ label: `Replay Cam C${n}`, index: n, ip: ipFor('replay', n, c), vlan: null, colour: 'replay' })
  }
  for (let n = 1; n <= c; n++) {
    out.push({ label: `Apple TV C${n}`, index: n, ip: ipFor('appletv', n, c), vlan: null, colour: 'appletv' })
  }
  for (let n = 1; n <= inputs.securityCameras; n++) {
    out.push({
      label: `Security Cam ${n}`, index: n, ip: ipFor('security', n, c),
      vlan: 'SURVEILLANCE', colour: 'security',
    })
  }
  // Readers are numbered across the venue — the ones on the gateway took the
  // first `readersOnUdm` numbers, so these continue rather than restart.
  const kisi = planKisi(inputs)
  for (let i = 1; i <= kisi.readersOnSwitch; i++) {
    const n = kisi.readersOnUdm + i
    out.push({
      label: `Kisi Reader ${n}`, index: n, ip: ipFor('reader', n, c),
      vlan: 'ACCESS CONTROL', colour: 'kisi',
    })
  }
  return out
}

/**
 * switches[0] is the larger, filled first, drawn topmost and titled Switch 1.
 * Rack order and fill order are the same order — there is no second convention.
 */
function buildSwitches(
  inputs: VenueInputs,
  plan: ReturnType<typeof planSwitches>,
): SwitchPlanned[] {
  const sizes: (24 | 48)[] = [
    ...Array<48>(plan.count48).fill(48),
    ...Array<24>(plan.count24).fill(24),
  ]
  const devices = devicesFor(inputs)
  let next = 0

  return sizes.map((size, i): SwitchPlanned => {
    const ports: PortAssignment[] = []
    for (let port = 1; port <= size; port++) {
      const d = devices[next]
      // The standard 24-port SKU has 16 PoE ports, not 24. planSwitches only
      // picks it below 4 courts, so ports 17-24 are always unassigned there.
      const nonPoe = size === 24 && plan.roleKey24 === 'switch_24_std' && port > 16
      if (d) {
        next++
        ports.push({
          port, label: d.label, index: d.index, ip: d.ip, vlan: d.vlan,
          colour: d.colour,
        })
      } else {
        ports.push({
          port, label: null, index: null, ip: null, vlan: null,
          colour: nonPoe ? 'nonpoe' : 'empty',
        })
      }
    }
    return {
      size,
      roleKey: size === 48 ? 'switch_48_pro' : plan.roleKey24,
      ports,
      // A gateway has one SFP+ LAN socket, so switch 2 daisy-chains off
      // switch 1. podplay-ph-venue-sizing.md sizes one DAC per switch.
      uplink: i === 0 ? 'gateway' : 'switch-1',
    }
  })
}

const SWITCH_ROLE_KEYS = [
  'switch_24_pro', 'switch_24_std', 'switch_48_pro',
] as const

/**
 * The hardware list prints stored lines; this page is planned from inputs. On
 * an "Export anyway" the two can disagree, and because mergeRecalculation
 * leaves edited and manual lines untouched, a hand-swapped switch line is
 * never stale — so the disagreement would be permanent and unwarned.
 *
 * Suppressed lines are not on the venue, and a null roleKey is not a switch;
 * counting either would make this misfire forever on a consistent venue.
 */
/** A multiset of role keys as a stable string, zero counts dropped. */
function tally(counts: Map<string, number>): string {
  return [...counts]
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, n]) => `${k}x${n}`)
    .join(',')
}

function switchLinesDisagree(
  lines: StoredLine[], planned: SwitchPlanned[],
): boolean {
  const onVenue = lines
    .filter(l => !l.suppressed && l.roleKey !== null)
    .filter(l => (SWITCH_ROLE_KEYS as readonly string[]).includes(l.roleKey!))

  // A venue that has never been recalculated has no lines at all; that is not
  // a disagreement, it is an empty table.
  if (lines.length === 0) return false
  // A venue that HAS a list with no switch on it is a different thing, and
  // must NOT fall through to the empty-table case: "Remove" on the switch row
  // only sets suppressed, so drawing a switch panel here would put a 48-port
  // switch on page 2 that page 1 does not list — the exact contradiction this
  // guard exists to prevent. Every drawable venue has at least one switch;
  // the 1-court venue that legitimately has none returned 'explained' above.
  if (onVenue.length === 0) return true

  // NEVER allocate from user data. `Array(-1)` and `Array(1.5)` both throw
  // RangeError, and this runs inside exportMaterialsPdf BEFORE doc.save()
  // with no try/catch above it — so one mistyped qty on the switch row would
  // take down the whole export, the client-facing hardware list included.
  // qty is free-typed on the row (`Number(text)`, min=0 but no step), so a
  // negative or fractional value is reachable in the in-memory lines this
  // reads. Counting instead of allocating also makes a TBD qty explicit: it
  // contributes zero copies, so a TBD switch line reads as a disagreement
  // rather than as a matching switch.
  const fromLines = new Map<string, number>()
  for (const l of onVenue) {
    const n = typeof l.qty === 'number' ? Math.max(0, Math.floor(l.qty)) : 0
    fromLines.set(l.roleKey!, (fromLines.get(l.roleKey!) ?? 0) + n)
  }
  const fromPlan = new Map<string, number>()
  for (const s of planned) {
    fromPlan.set(s.roleKey, (fromPlan.get(s.roleKey) ?? 0) + 1)
  }
  return tally(fromLines) !== tally(fromPlan)
}

function notesFor(inputs: VenueInputs): string[] {
  const notes = [
    `REPLAY ${REPLAY_NET}.0/24 · SURVEILLANCE ${SURVEILLANCE_NET}.0/24 · `
    + `ACCESS CONTROL ${ACCESS_NET}.0/24 — a venue preconfigured in the lab `
    + 'inherits the 13x block (132 / 131 / 133). Verify before labelling.',
    'Unassigned ports are not all spare — access-point count is not sized by '
    + 'this tool.',
  ]
  if (inputs.courts >= WIDE_FROM) {
    notes.push(
      'Replay camera and Apple TV addresses use the 9+ court plan (.121+ / '
      + '.161+). A venue previously configured at 8 courts or fewer must be '
      + 're-addressed.',
    )
  }
  // Spec §11. The whole feature exists because this sheet is where
  // KISI_READER_PLACEMENT lands; an installer following PodPlay's guide will
  // not put readers on the gateway, so the sheet has to say we do.
  if (planKisi(inputs).readersOnUdm > 0) {
    notes.push(
      'Readers on gateway PoE ports are a Kosmas deviation. PodPlay\'s guides '
      + 'put every reader on the switch.',
    )
  }
  if (inputs.tier === 'autonomous_plus') {
    notes.push(
      'UNVR / UNVR-Pro and its 8TB drives are specified separately and are not '
      + `shown here. Reserve ${ipFor('nvr', 1, inputs.courts)}. The BOM buys `
      + 'one 0.5m SFP+ DAC per NVR.',
    )
  }
  return notes
}

export function buildPortPlan(
  inputs: VenueInputs, lines: StoredLine[],
): PortPlan {
  // The gates ARE the tier definitions — no sizing module reads inputs.tier,
  // so without this a Basic venue draws a 24-port switch it does not have.
  // Five conditions block, not two; call the function rather than listing them.
  if (evaluateGates(inputs).blocked) return absent(inputs)

  const ports = totalPorts(inputs)
  const switches = planSwitches(inputs, ports)

  if (inputs.courts === 1) {
    // The court gear is on the gateway here, so an overflow is the GATEWAY
    // being full — there is no switch for anything to be sized onto, and
    // saying there was described planKisi's old arithmetic rather than the
    // venue. Unreachable at the 1-2 doors such a venue runs; see
    // GATEWAY_OVERSUBSCRIBED in calculator/index.ts.
    const unplaced = planKisi(inputs).readersUnplaced
    return explained(
      inputs,
      'This venue is sized with no switch — the gateway powers the single '
      + 'court directly — so there is no switch port assignment to draw.'
      + (unplaced > 0
        ? ` It also needs ${gatewayPortDemand(inputs)} gateway ports and the `
          + `gateway has ${UDM_RJ45_PORTS}, leaving ${unplaced} reader(s) `
          + 'with nowhere to land. Resolve the hardware list first.'
        : ''),
    )
  }

  if (switches.overCapacity) {
    return explained(
      inputs,
      `${ports} ports exceeds the largest sizing band. The hardware list is `
      + 'still correct; this venue\'s port assignment is specified separately.',
    )
  }

  if (inputs.courts > MAX_COURTS_ADDRESSED) {
    return explained(
      inputs,
      `The addressing plan is defined to ${MAX_COURTS_ADDRESSED} courts; above `
      + 'that the replay camera and Apple TV blocks collide. This venue\'s '
      + 'port assignment is specified separately.',
    )
  }

  const count = switches.count24 + switches.count48
  if (count > 2) {
    return explained(
      inputs,
      `This venue is sized with ${count} switches (three or more). The `
      + 'hardware list is still correct; this venue\'s port assignment is '
      + 'specified separately.',
    )
  }

  if (inputs.securityCameras > MAX_SECURITY_CAMERAS) {
    return explained(
      inputs,
      `${inputs.securityCameras} security cameras exceeds the addressing plan, `
      + 'whose camera block ends below the NVR reservation. This venue\'s port '
      + 'assignment is specified separately.',
    )
  }

  if (gatewayDemand(inputs) > GATEWAY_RJ45) {
    return explained(
      inputs,
      `This venue needs ${gatewayDemand(inputs)} gateway ports and the gateway `
      + `has ${GATEWAY_RJ45}. The hardware list is still correct; this venue's `
      + 'port assignment is specified separately.',
    )
  }

  const planned = buildSwitches(inputs, switches)

  if (switchLinesDisagree(lines, planned)) {
    return explained(
      inputs,
      'The hardware list and the port assignment disagree about this venue\'s '
      + 'switches. Recalculate before issuing this document.',
    )
  }

  return {
    outcome: 'drawn', reason: null, summary: summaryOf(inputs),
    notes: notesFor(inputs),
    gateway: buildGateway(inputs),
    switches: planned,
  }
}
