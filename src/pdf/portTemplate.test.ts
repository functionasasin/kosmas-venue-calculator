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
