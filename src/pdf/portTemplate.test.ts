import { describe, it, expect, vi } from 'vitest'
import jsPDF from 'jspdf'
import { appendPortTemplate } from './portTemplate'
import { buildPortPlan } from './portPlan'
import type { VenueInputs } from '@/calculator/types'

const pro = (courts: number, over: Partial<VenueInputs> = {}): VenueInputs => ({
  courts, tier: 'pro', securityCameras: 0, kisiDoors: 0,
  extendedRetention: false, backupInternet: false, ...over,
})

/** Every string the drawing wrote, in order. */
function drawnText(plan: ReturnType<typeof buildPortPlan>): string[] {
  const doc = new jsPDF()
  const out: string[] = []
  const text = vi.spyOn(doc, 'text').mockImplementation(((t: string | string[]) => {
    out.push(...(Array.isArray(t) ? t : [t]))
    return doc
  }) as typeof doc.text)
  appendPortTemplate(doc, 'Helios Beta', 'Pro', plan)
  text.mockRestore()
  return out
}

describe('appendPortTemplate', () => {
  // A blocked tier gets no page and nothing said.
  it('adds no page at all when the outcome is absent', () => {
    const doc = new jsPDF()
    const before = doc.getNumberOfPages()
    appendPortTemplate(doc, 'X', 'Basic', buildPortPlan(pro(8, { tier: 'basic' }), []))
    expect(doc.getNumberOfPages()).toBe(before)
  })

  it('adds one page carrying the reason when the outcome is explained', () => {
    const doc = new jsPDF()
    const before = doc.getNumberOfPages()
    const plan = buildPortPlan(pro(1), [])
    appendPortTemplate(doc, 'X', 'Pro', plan)
    expect(doc.getNumberOfPages()).toBe(before + 1)
    expect(drawnText(plan).join(' ')).toMatch(/no switch/i)
  })

  // The explanation goes outside the company, so it must not name an internal
  // repo or tool.
  it('names no internal tooling on the explanation page', () => {
    const text = drawnText(buildPortPlan(pro(33), [])).join(' ')
    expect(text).not.toMatch(/port-template-generator|Kosmas Setup|\bCLI\b/i)
  })

  // The header is drawn as ONE joined string; port labels are drawn as two
  // lines each ("iPad" then "C1"), because that is how they fit a 13.2mm box.
  // Assert what the drawing actually emits, not the logical label.
  it('draws the venue, the tier and every port label', () => {
    const text = drawnText(buildPortPlan(pro(8), []))
    expect(text.join(' ')).toContain('Helios Beta  ·  Pro')
    expect(text).toContain('iPad')
    expect(text).toContain('Apple TV')
    expect(text).toContain('C8')
    // Not split: only a trailing device number is broken onto its own line.
    expect(text).toContain('Mac Mini')
  })

  it('draws the legend and names all three networks', () => {
    const text = drawnText(buildPortPlan(pro(8), [])).join(' ')
    expect(text).toContain('Replay Camera')
    expect(text).toContain('Unassigned')
    // Spec §7: each device CLASS mapped to its network. A bare list of the
    // three network names does not tell a reader which box belongs to which —
    // and a Kisi controller box carries no VLAN tag, so its .11 is otherwise
    // indistinguishable from a REPLAY address.
    expect(text).toContain('Mac Mini — REPLAY')
    expect(text).toContain('NVR — SURVEILLANCE')
    expect(text).toContain('reader — ACCESS CONTROL')
    // The CIDRs are carried once, by the first note — not restated here.
    expect(text).toContain('REPLAY 192.168.32.0/24')
  })

  // Spec §9 — a pale unlabelled box reads as spare capacity.
  it('labels the non-PoE ports of the standard 24-port SKU', () => {
    expect(drawnText(buildPortPlan(pro(2), []))).toContain('NO PoE')
  })

  it('prints every note under the legend', () => {
    const plan = buildPortPlan(pro(9), [])
    const text = drawnText(plan).join(' ')
    for (const note of plan.notes) expect(text).toContain(note.slice(0, 40))
  })

  // `if (plan.gateway)` -> `if (false)` used to pass every test in this file
  // AND the browser driver, because the driver's 'Mac Mini' check is satisfied
  // by the LEGEND entry. §10's entire panel could vanish unnoticed.
  it('draws the gateway panel, titled with the model that was picked', () => {
    expect(drawnText(buildPortPlan(pro(8), []))).toContain('UDM-Pro')
    const kisi = buildPortPlan(pro(8, { tier: 'autonomous', kisiDoors: 2 }), [])
    expect(drawnText(kisi)).toContain('UDM-SE')
  })

  it('draws the port-number strip and the switch uplink box', () => {
    const text = drawnText(buildPortPlan(pro(8), []))
    expect(text).toContain('Port 1')
    expect(text).toContain('Port 24')
    expect(text).toContain('to Gateway')
  })

  // The VLAN tag in the box is the artefact spec §11 says this feature exists
  // for — KISI_READER_PLACEMENT's instruction to tag the port, not merely a
  // legend entry. The Pro venue every other test uses never produces one.
  it('tags the box itself on the venues that have a VLAN to tag', () => {
    const text = drawnText(buildPortPlan(pro(8, {
      tier: 'autonomous_plus', securityCameras: 1, kisiDoors: 6,
      backupInternet: true,
    }), []))
    expect(text).toContain('ACCESS')
    expect(text).toContain('SURVEIL')
  })

  // The addresses are the most load-bearing content on the sheet and nothing
  // asserted a box carried one: the driver's .121/.161 check is satisfied by
  // the 9+ note that names those same blocks.
  it('prints an address in the port boxes, not only in the notes', () => {
    const text = drawnText(buildPortPlan(pro(14), []))
    // Replay C14 and Apple TV C14 under the wide blocks. Neither appears in
    // any note — the 9+ note names only the block starts, .121+ and .161+.
    expect(text).toContain('.134')
    expect(text).toContain('.174')
  })

  it('draws both switches of a mixed pair', () => {
    const text = drawnText(buildPortPlan(pro(17), [])).join(' ')
    expect(text).toMatch(/Switch 1/)
    expect(text).toMatch(/Switch 2/)
  })
})

// ---------------------------------------------------------------------------
// A4 portrait, one paper size for the whole document.
//
// The port pages were A3 landscape while page 1 was A4 portrait. Printed on
// the A4 most people have, page 2 was silently scaled to 70.7% and the port
// numbers and host octets — the two things read at the rack — dropped to
// 3.3pt. Getting it right meant an A3 tray and per-page paper selection on
// every print. One size, click print, no arranging.

/** A4 portrait in points, as jsPDF records it per page. */
const A4_PORTRAIT = { w: 595.28, h: 841.89 }
const PRINTABLE_RIGHT = 200   // 210 page − 10 margin
const BAND_TOP = 23.76        // header band height
const BAND_BOTTOM = 284.82    // footer band top edge

/**
 * Draws the plan and records the geometry, because "does it fit the paper" is
 * a question about coordinates and no text assertion can answer it. Font size
 * is tracked alongside each string so a line's real width can be measured.
 */
function geometry(plan: ReturnType<typeof buildPortPlan>) {
  const doc = new jsPDF()
  const strings: { s: string; x: number; y: number; size: number }[] = []
  const rects: { x: number; y: number; w: number; h: number }[] = []
  let size = 12

  // Every spy CALLS THROUGH. The layout asks doc.getTextWidth() to decide
  // where the legend wraps, so a mocked-out setFontSize would have it
  // measuring at the wrong size and the test would exercise a wrap that never
  // happens in the real document.
  const setSize = doc.setFontSize.bind(doc)
  const drawText = doc.text.bind(doc)
  const drawRect = doc.rect.bind(doc)
  vi.spyOn(doc, 'setFontSize').mockImplementation(((n: number) => {
    size = n
    return setSize(n)
  }) as typeof doc.setFontSize)
  vi.spyOn(doc, 'text').mockImplementation(((t: string | string[], x: number, y: number) => {
    for (const s of Array.isArray(t) ? t : [t]) strings.push({ s, x, y, size })
    return drawText(t as string, x, y)
  }) as typeof doc.text)
  vi.spyOn(doc, 'rect').mockImplementation(((x: number, y: number, w: number, h: number, st?: string) => {
    rects.push({ x, y, w, h })
    return drawRect(x, y, w, h, st)
  }) as typeof doc.rect)

  appendPortTemplate(doc, 'Helios Beta', 'Pro', plan)
  vi.restoreAllMocks()

  // Measured on a clean doc: the drawing doc's own font state is spied out.
  const ruler = new jsPDF()
  type Measured = { s: string; x: number; y: number; size: number; right: number }
  const widest = strings.reduce<Measured>((worst, r) => {
    ruler.setFontSize(r.size)
    const right = r.x + ruler.getTextWidth(r.s)
    return right > worst.right ? { ...r, right } : worst
  }, { s: '', x: 0, y: 0, size: 0, right: 0 })

  return { doc, strings, rects, widest, pages: doc.getNumberOfPages() }
}

const portPages = (doc: jsPDF) => {
  const out: { w: number; h: number }[] = []
  // Page 1 is the hardware list; every page after it is a port page.
  for (let p = 2; p <= doc.getNumberOfPages(); p++) {
    const b = doc.getPageInfo(p).pageContext.mediaBox
    out.push({ w: b.topRightX, h: b.topRightY })
  }
  return out
}

describe('the port pages are the same paper as the hardware list', () => {
  it('adds A4 portrait pages, not A3 landscape', () => {
    const { doc } = geometry(buildPortPlan(pro(8), []))
    expect(portPages(doc)).toEqual([A4_PORTRAIT])
  })

  // The 48-port panel is 351mm wide and A4 portrait offers 190mm. This is the
  // venue the whole change turns on — Tela Park and Helios Beta are both 14
  // courts, so this is the page that actually gets printed.
  it('keeps a 14-court venue on A4 too, where the panel does not fit', () => {
    const { doc } = geometry(buildPortPlan(pro(14), []))
    expect(portPages(doc).every(p => p.w === A4_PORTRAIT.w)).toBe(true)
  })

  it('keeps every panel and box inside the printable width', () => {
    for (const courts of [1, 8, 14, 24, 32]) {
      const { rects } = geometry(buildPortPlan(pro(courts), []))
      const over = rects.filter(r => r.x + r.w > PRINTABLE_RIGHT + 0.01)
      expect(over, `${courts} courts overflows`).toEqual([])
    }
  })

  // Legend, network mapping and notes were laid out for a 420mm page. On A4
  // they run off the edge unless they wrap, and text running off the edge is
  // invisible rather than obviously broken.
  it('keeps every line of text inside the printable width', () => {
    for (const courts of [1, 8, 14, 32]) {
      const { widest } = geometry(buildPortPlan(pro(courts), []))
      expect(widest.right, `${courts} courts: "${widest.s}"`)
        .toBeLessThanOrEqual(PRINTABLE_RIGHT + 0.01)
    }
  })

  // The letterhead is painted over these pages now, so anything drawn under
  // the bands is covered rather than merely ugly.
  it('keeps content clear of the letterhead bands', () => {
    for (const courts of [1, 14, 32]) {
      const g = geometry(buildPortPlan(pro(courts), []))
      for (const r of [...g.strings.map(s => ({ y: s.y })), ...g.rects]) {
        expect(r.y).toBeGreaterThanOrEqual(BAND_TOP)
        expect(r.y).toBeLessThanOrEqual(BAND_BOTTOM)
      }
    }
  })
})

describe('a 48-port switch continues below instead of running off the page', () => {
  it('draws it as two halves, each naming its own port range', () => {
    const text = drawnText(buildPortPlan(pro(14), [])).join(' | ')
    expect(text).toMatch(/Ports 1-24/)
    expect(text).toMatch(/Ports 25-48/)
  })

  /** Everything drawn from the switch's first panel onward. The gateway panel
   *  numbers its own 8 ports and carries its own SFP cell, so both assertions
   *  below are meaningless unless it is excluded. */
  const switchRegion = (courts: number) => {
    const text = drawnText(buildPortPlan(pro(courts), []))
    return text.slice(text.findIndex(t => /^Switch 1/.test(t)))
  }

  // Both halves belong to one switch: the numbering must run 1..48 across
  // them, not restart. A port labelled 25 on the drawing has to be port 25 on
  // the device.
  it('numbers the ports across both halves, never restarting', () => {
    const nums = switchRegion(14)
      .filter(t => /^Port \d+$/.test(t))
      .map(t => Number(t.slice(5)))
    expect(nums).toEqual([...Array(48)].map((_, i) => i + 1))
  })

  // The SFP uplink is one socket at the right end of the switch face, so it
  // belongs on the LAST half. Drawing it on both would spec two DACs.
  it('puts the single uplink on the last half only', () => {
    expect(switchRegion(14).filter(t => /SFP DAC/.test(t)).length).toBe(1)
  })

  it('leaves a 24-port switch as one panel with no port-range suffix', () => {
    expect(drawnText(buildPortPlan(pro(8), [])).join(' | '))
      .not.toMatch(/Ports \d+-\d+/)
  })
})

describe('port panels flow onto another page when they run out of room', () => {
  it('keeps a 14-court venue on a single port page', () => {
    expect(geometry(buildPortPlan(pro(14), [])).pages).toBe(2)
  })

  // 32 courts is two 48-port switches: a gateway panel plus four halves.
  // Five panels do not fit the 250mm between the letterhead bands.
  it('adds a second port page for a venue with two 48-port switches', () => {
    expect(geometry(buildPortPlan(pro(32), [])).pages).toBeGreaterThan(2)
  })

  // The venue name is in the title block on the first port page only. A
  // continuation sheet that names a switch and a port range but not the venue
  // is ambiguous the moment the pages come apart — and these are handed to an
  // installer who may be working across more than one site.
  it('names the venue again on a continuation page', () => {
    const first = drawnText(buildPortPlan(pro(14), []))
    const spilled = drawnText(buildPortPlan(pro(32), []))
    const mentions = (t: string[]) =>
      t.filter(s => s.includes('Helios Beta')).length
    expect(mentions(first)).toBe(1)
    expect(mentions(spilled)).toBe(2)
    expect(spilled.some(t => /continued/i.test(t))).toBe(true)
  })
})
