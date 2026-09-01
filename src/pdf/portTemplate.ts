import type jsPDF from 'jspdf'
import { FOOTER_BAND, HEADER_BAND, KOSMAS_NAVY } from './letterhead'
import type {
  DeviceColour, GatewayPlanned, PortAssignment, PortPlan, SwitchPlanned,
} from './portPlan'

/**
 * Vector primitives, not a rasterised HTML screenshot. The address octet in
 * the corner of each box is a ~1.9mm digit on printed A3 and is the thing an
 * installer reads while holding a cable; rasterising costs exactly that
 * detail. Vector also keeps the text selectable and adds no dependency.
 */

const FILL: Record<DeviceColour, [number, number, number]> = {
  ipad:     [189, 215, 238],
  replay:   [226, 239, 218],
  appletv:  [252, 228, 214],
  security: [226, 217, 243],
  kisi:     [255, 242, 204],
  gateway:  [214, 220, 228],
  sfp:      [217, 217, 217],
  empty:    [255, 255, 255],
  nonpoe:   [237, 237, 237],
}

// The port pages are the same A4 portrait sheet as the hardware list, so the
// whole document prints from one tray at 100%. They were A3 landscape, which
// meant an A4 printer silently scaled them to 70.7% and put the port numbers
// and host octets — the two things read at the rack — at 3.3pt.
const M = 10          // page margin
const TEXT_W = 210 - M * 2                  // 190mm of usable width
const CONTENT_TOP = HEADER_BAND.h + 6       // clears the letterhead header
const CONTENT_BOTTOM = FOOTER_BAND.y - 5    // clears the contact strip
const BOX = 13.2      // port box, square
const GAP = 0.6
const PITCH = BOX + GAP
const BREAK = 3       // wider gutter before an uplink cluster
const NUM_H = 3.6     // port-number strip
const PAD = 2         // panel inner padding
const TITLE_H = 4.6
const PANEL_H = NUM_H * 2 + BOX * 2 + PAD * 2

interface Cell {
  num: string | null
  lines: { t: string; small?: boolean }[]
  colour: DeviceColour
}

/** Shrink to fit rather than clip — a truncated port label is worse. */
function fitted(doc: jsPDF, t: string, base: number): number {
  let size = base
  doc.setFontSize(size)
  while (doc.getTextWidth(t) > BOX - 2 && size > 3.6) {
    size -= 0.2
    doc.setFontSize(size)
  }
  return size
}

function drawBox(doc: jsPDF, x: number, y: number, cell: Cell): void {
  doc.setFillColor(...FILL[cell.colour])
  doc.setDrawColor(0)
  doc.setLineWidth(0.2)
  doc.rect(x, y, BOX, BOX, 'FD')
  doc.setTextColor(0)
  // Baselines are computed bottom-up (the stack is anchored to the box floor so
  // a long label grows away from the port number) but DRAWN top-down, so the
  // text the PDF contains is in reading order. Drawing bottom-up emits
  // ".21, C1, iPad" and no reader — human or test — can match "iPad C1".
  const advance = cell.lines.map(l => (l.small ? 2.1 : 2.5))
  const baseline: number[] = []
  let below = 0
  for (let i = cell.lines.length - 1; i >= 0; i--) {
    baseline[i] = y + BOX - 1.6 - below
    below += advance[i]
  }
  cell.lines.forEach((l, i) => {
    fitted(doc, l.t, l.small ? 5.4 : 6.4)
    doc.text(l.t, x + 1, baseline[i])
  })
}

function drawNum(doc: jsPDF, x: number, y: number, label: string | null): void {
  if (!label) return
  doc.setFontSize(5.4)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0)
  doc.text(label, x + BOX / 2, y + 2.6, { align: 'center' })
  doc.setFont('helvetica', 'normal')
}

/**
 * One panel: a title, then columns of (number, top box, bottom box, number).
 * `columns` is pairs — odd ports on top, even below, as the hardware is laid
 * out. `breakAt` inserts the wider gutter before that column index.
 */
function drawPanel(
  doc: jsPDF, x: number, y: number, title: string,
  columns: { top: Cell; bottom: Cell | null }[], breakAt: number | null,
): number {
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0)
  doc.text(title, x, y + 3)
  doc.setFont('helvetica', 'normal')

  const bodyY = y + TITLE_H
  const width = columns.length * PITCH - GAP + PAD * 2
    + (breakAt === null ? 0 : BREAK)
  doc.setDrawColor(0)
  doc.setLineWidth(0.5)
  doc.rect(x, bodyY, width, PANEL_H)

  let cx = x + PAD
  columns.forEach((col, i) => {
    if (breakAt !== null && i === breakAt) cx += BREAK
    const topY = bodyY + PAD
    drawNum(doc, cx, topY, col.top.num)
    drawBox(doc, cx, topY + NUM_H, col.top)
    if (col.bottom) {
      drawBox(doc, cx, topY + NUM_H + BOX, col.bottom)
      drawNum(doc, cx, topY + NUM_H + BOX * 2, col.bottom.num)
    }
    cx += PITCH
  })
  return TITLE_H + PANEL_H
}

const short = (ip: string | null) => (ip ? `.${ip.split('.')[3]}` : null)

function cellFor(
  label: string | null, ip: string | null, vlan: string | null,
  colour: DeviceColour, num: string | null,
): Cell {
  const lines: { t: string; small?: boolean }[] = []
  if (label) {
    // Split only a trailing device number, so "iPad C1" becomes two lines but
    // "Mac Mini" and "Backup Internet" stay whole. Splitting on the last word
    // unconditionally turns "Mac Mini" into "Mac" / "Mini".
    const m = label.match(/^(.*?)\s+(C?\d+)$/)
    if (m) { lines.push({ t: m[1] }); lines.push({ t: m[2] }) }
    else lines.push({ t: label })
  }
  if (vlan) lines.push({ t: vlan === 'ACCESS CONTROL' ? 'ACCESS' : 'SURVEIL', small: true })
  if (ip) lines.push({ t: short(ip)!, small: true })
  // Spec §9 — tint alone is a light grey that does not survive a photocopy,
  // and an unlabelled pale box reads as spare capacity rather than as a port
  // that cannot power a court device.
  if (colour === 'nonpoe') lines.push({ t: 'NO PoE', small: true })
  return { num, lines, colour }
}

function gatewayColumns(g: GatewayPlanned) {
  const rj45 = g.ports.filter(p => typeof p.slot === 'number')
  const wan = g.ports.find(p => p.slot === 'wan')
  const sfp = g.ports.find(p => p.slot === 'sfp')
  const at = (slot: number) => rj45.find(p => p.slot === slot)

  const columns: { top: Cell; bottom: Cell | null }[] = []
  // Physical face: odd ports on top, even below.
  for (let pair = 0; pair < 4; pair++) {
    const t = pair * 2 + 1
    const b = pair * 2 + 2
    const tp = at(t)
    const bp = at(b)
    columns.push({
      top: cellFor(tp?.label ?? null, tp?.ip ?? null, tp?.vlan ?? null,
        tp ? tp.colour : 'empty', `Port ${t}`),
      bottom: cellFor(bp?.label ?? null, bp?.ip ?? null, bp?.vlan ?? null,
        bp ? bp.colour : 'empty', `Port ${b}`),
    })
  }
  // Built explicitly, NOT through cellFor: "SFP DAC to Switch 1" ends in a
  // digit, so the trailing-number split would break it into "SFP DAC to Switch"
  // (shrunk to the 3.6pt floor to fit) plus an orphan "1" that reads as a
  // device index. The switch panel's uplink cell is built the same explicit way.
  columns.push({
    top: {
      num: 'SFP',
      lines: sfp?.label ? [{ t: 'SFP DAC' }, { t: 'to Switch 1' }] : [],
      // Read from the port, never hardcoded: a single-court venue buys no
      // switch and marks its SFP+ 'empty', and painting it the SFP grey anyway
      // makes an unused socket look like a populated one. No unit test can see
      // this — only the rendered PDF can.
      colour: sfp?.colour ?? 'sfp',
    },
    bottom: cellFor(wan?.label ?? null, null, null, 'gateway', 'WAN'),
  })
  return { columns, breakAt: 4 }
}

/**
 * 24 ports per panel. 12 columns plus the uplink is 185.8mm against the 190mm
 * A4 portrait offers; 13 columns would be 199.6mm and run off the sheet.
 */
const PORTS_PER_PANEL = 24

interface SwitchPanel {
  columns: { top: Cell; bottom: Cell | null }[]
  breakAt: number | null
  /** 'Ports 25-48', or null when the switch is one panel and needs no range. */
  range: string | null
}

/**
 * A 48-port face is 351mm wide and does not fit the page at any legible box
 * size — the labels already sit on a 3.6pt floor at the current 13.2mm box.
 * So it CONTINUES BELOW as two labelled halves rather than being shrunk or
 * spilled off the edge. Port numbers run 1..48 across them and never restart:
 * a box labelled 25 has to be port 25 on the device.
 */
function switchPanels(sw: SwitchPlanned): SwitchPanel[] {
  const chunks: PortAssignment[][] = []
  for (let i = 0; i < sw.ports.length; i += PORTS_PER_PANEL) {
    chunks.push(sw.ports.slice(i, i + PORTS_PER_PANEL))
  }

  return chunks.map((ports, ci): SwitchPanel => {
    const columns: { top: Cell; bottom: Cell | null }[] = []
    for (let i = 0; i < ports.length; i += 2) {
      const t = ports[i]
      const b = ports[i + 1]
      columns.push({
        top: cellFor(t.label, t.ip, t.vlan, t.colour, `Port ${t.port}`),
        bottom: b
          ? cellFor(b.label, b.ip, b.vlan, b.colour, `Port ${b.port}`)
          : null,
      })
    }

    // One socket at the right end of the device face, so it belongs on the
    // LAST panel only. Drawing it on both halves would spec two DACs.
    const last = ci === chunks.length - 1
    if (last) {
      const uplink = sw.uplink === 'gateway'
        ? 'SFP DAC\nto Gateway' : 'SFP DAC\nto Switch 1'
      columns.push({
        top: {
          num: 'Uplink',
          lines: uplink.split('\n').map(t => ({ t })),
          colour: 'sfp',
        },
        bottom: null,
      })
    }

    return {
      columns,
      breakAt: last ? columns.length - 1 : null,
      // Only when the switch actually split. A range on a 24-port panel would
      // imply a second half that does not exist.
      range: chunks.length > 1
        ? `Ports ${ports[0].port}-${ports[ports.length - 1].port}`
        : null,
    }
  })
}

const TITLES: Record<string, string> = {
  gateway_udm_se: 'UDM-SE',
  gateway_udm_pro: 'UDM-Pro',
  switch_24_pro: 'USW-Pro-24-PoE (24 port)',
  switch_24_std: 'USW-24-PoE (24 port · 16 PoE)',
  switch_48_pro: 'USW-Pro-48-PoE (48 port)',
}

/**
 * Adds the port pages. Nothing here decides a quantity, an address or a
 * switch size — all of that arrives on `plan`.
 */
export function appendPortTemplate(
  doc: jsPDF, venueName: string, tierLabel: string, plan: PortPlan,
): void {
  if (plan.outcome === 'absent') return

  // Same A4 portrait sheet as the hardware list — no format argument.
  doc.addPage()
  let y = CONTENT_TOP

  doc.setTextColor(...KOSMAS_NAVY)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('PORT TEMPLATE', M, y + 5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(60)
  const { courts, securityCameras, kisiDoors } = plan.summary
  doc.text(
    [
      venueName, tierLabel, `${courts} Court${courts === 1 ? '' : 's'}`,
      kisiDoors > 0 ? `${kisiDoors} Door${kisiDoors === 1 ? '' : 's'}` : null,
      securityCameras > 0
        ? `${securityCameras} Security Cam${securityCameras === 1 ? '' : 's'}`
        : null,
    ].filter(Boolean).join('  ·  '),
    M, y + 10.5,
  )
  y += 16

  if (plan.outcome === 'explained') {
    doc.setFontSize(10)
    doc.setTextColor(60)
    doc.text(doc.splitTextToSize(plan.reason ?? '', TEXT_W), M, y)
    return
  }

  // Legend — spec §7 and §12. Without it the colour banding is decoration and
  // the three networks are never named on the page.
  const legend: [DeviceColour, string][] = [
    ['ipad', 'iPad'], ['replay', 'Replay Camera'], ['appletv', 'Apple TV'],
    ['gateway', 'Mac Mini'], ['security', 'Security Camera'], ['kisi', 'Kisi'],
    ['empty', 'Unassigned'],
  ]
  let lx = M
  doc.setFontSize(6.4)
  for (const [colour, label] of legend) {
    // Seven swatches were laid out for a 420mm page. On 190mm they wrap.
    const entry = 4 + doc.getTextWidth(label)
    if (lx > M && lx + entry > M + TEXT_W) {
      lx = M
      y += 4.5
    }
    doc.setFillColor(...FILL[colour])
    doc.setDrawColor(0)
    doc.setLineWidth(0.2)
    doc.rect(lx, y - 2.2, 2.8, 2.8, 'FD')
    doc.setTextColor(40)
    doc.text(label, lx + 4, y)
    lx += entry + 7
  }
  y += 5
  // Spec §7, which maps each device CLASS to its network. Without it the only
  // thing on the page relating a box to a network is the ACCESS / SURVEIL tag,
  // and controller boxes deliberately carry no tag — the tag doubles as
  // KISI_READER_PLACEMENT's instruction and the sources scope that to readers
  // — so a controller's `.11` read as REPLAY .32.11 rather than ACCESS .33.11.
  // CIDRs are deliberately NOT repeated here: the first note opens with all
  // three, and printing them twice put the same 90-character string 5mm above
  // itself. It is the MAPPING that has to be on the page, not the numbers.
  doc.setTextColor(60)
  const mapping = doc.splitTextToSize(
    'iPad · Replay Camera · Apple TV · Mac Mini — REPLAY      '
    + 'Security Camera · NVR — SURVEILLANCE      '
    + 'Kisi controller · reader — ACCESS CONTROL',
    TEXT_W,
  )
  doc.text(mapping, M, y)
  y += 5 + 3.2 * (mapping.length - 1)

  doc.setFontSize(6.4)
  doc.setTextColor(90)
  for (const note of plan.notes) {
    const wrapped = doc.splitTextToSize(note, TEXT_W)
    doc.text(wrapped, M, y)
    y += 3.2 * Math.max(1, wrapped.length)
  }
  y += 3

  // Panels flow down the page and continue on a new one when they run out of
  // room, the way the hardware list already does. A 32-court venue is a
  // gateway plus four half-panels, which does not fit the 250mm between the
  // letterhead bands.
  //
  // A continuation page re-states the venue. The title block is on the first
  // port page only, so without this a spilled sheet names a switch and a port
  // range but not the site it belongs to — and these get handed to an
  // installer who may be working across more than one.
  const room = (at: number): number => {
    if (at + TITLE_H + PANEL_H <= CONTENT_BOTTOM) return at
    doc.addPage()
    doc.setFontSize(9)
    doc.setTextColor(60)
    doc.setFont('helvetica', 'normal')
    doc.text(`${venueName} · Port template (continued)`, M, CONTENT_TOP)
    return CONTENT_TOP + 6
  }

  if (plan.gateway) {
    const { columns, breakAt } = gatewayColumns(plan.gateway)
    y = room(y)
    y += drawPanel(doc, M, y, TITLES[plan.gateway.roleKey], columns, breakAt) + 6
  }
  plan.switches.forEach((sw, i) => {
    const title = `Switch ${i + 1} — ${TITLES[sw.roleKey]}`
    for (const panel of switchPanels(sw)) {
      y = room(y)
      y += drawPanel(
        doc, M, y, panel.range ? `${title} · ${panel.range}` : title,
        panel.columns, panel.breakAt,
      ) + 6
    }
  })
}
