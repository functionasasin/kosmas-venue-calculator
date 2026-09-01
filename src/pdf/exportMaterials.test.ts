import { describe, it, expect, vi } from 'vitest'
import type { Item } from '@/calculator/types'
import type { RoleKey } from '@/calculator/roleKeys'
import type { StoredLine } from '@/data/venueLines'
import { groupIntoSections } from '@/lib/sections'
import { FOOTER_BAND, FOOTER_PNG, HEADER_PNG } from './letterhead'
import jsPDF from 'jspdf'
import { buildPdfBody, exportMaterialsPdf, stampLetterhead } from './exportMaterials'

// Hoisted to file top level: every describe below passes it to
// exportMaterialsPdf, which now sizes the port page from the venue's inputs.
const inputs = {
  courts: 8, tier: 'pro' as const, securityCameras: 0, kisiDoors: 0,
  extendedRetention: false, backupInternet: false,
}

// exportMaterialsPdf is exercised (rather than only buildPdfBody) for the
// footer test below, since the footer sentence is drawn directly with
// doc.text and never passes through buildPdfBody's rows. jsPDF and
// jspdf-autotable are stubbed because they draw vector graphics that jsdom
// has no reason to be exercised by in a unit test — only the calls to
// `text` matter here.
const { textCalls, imageCalls, saveCalls } = vi.hoisted(() => ({
  textCalls: [] as string[],
  imageCalls: [] as { data: string; page: number }[],
  saveCalls: [] as string[],
}))
vi.mock('jspdf', () => {
  class FakeJsPDF {
    pages = 1
    page = 1
    setFontSize() { return this }
    setTextColor() { return this }
    text(str: string) { textCalls.push(str); return this }
    addPage() { this.pages++; this.page = this.pages; return this }
    getNumberOfPages() { return this.pages }
    setPage(n: number) { this.page = n; return this }
    addImage(data: string) { imageCalls.push({ data, page: this.page }); return this }
    // appendPortTemplate draws vector primitives, so the fake needs the seven
    // methods the hardware list never called. Without them every test in this
    // file throws the moment a venue reaches a drawn or explained outcome.
    setFont() { return this }
    setFillColor() { return this }
    setDrawColor() { return this }
    setLineWidth() { return this }
    rect() { return this }
    getTextWidth() { return 5 }
    splitTextToSize(t: string) { return [t] }
    // The filename is the only thing save() is asserted on; no real download
    // happens in a unit test.
    save(name: string) { saveCalls.push(name) }
  }
  return { default: FakeJsPDF }
})
// Stubbed like jsPDF, but it reports back where the table ended: that number
// decides whether the closing note still fits above the contact strip, and it
// is the only input to that branch.
const { tableEnd, lastOptions } = vi.hoisted(() => ({
  tableEnd: { finalY: undefined as number | undefined },
  // The autoTable config, captured so didParseCell can be exercised: it is
  // where a note row gets its own type, and nothing else can see that.
  lastOptions: { current: undefined as undefined | Record<string, unknown> },
}))
vi.mock('jspdf-autotable', () => ({
  default: vi.fn((
    doc: { lastAutoTable?: { finalY: number } },
    options: Record<string, unknown>,
  ) => {
    lastOptions.current = options
    if (tableEnd.finalY !== undefined) doc.lastAutoTable = { finalY: tableEnd.finalY }
  }),
}))

const item = (roleKey: RoleKey, category: string, name: string): Item => ({
  id: `id-${roleKey}`, name, category, roleKey,
  supplier: null, poeWatts: null, mainsWatts: null, rackU: null,
  isActive: true, isDefault: true, notes: null, printNote: null,
})

const line = (roleKey: RoleKey, qty: StoredLine['qty']): StoredLine => ({
  id: `line-${roleKey}`, venueId: 'v', itemId: `id-${roleKey}`,
  roleKey, qty, originRoleKey: null, sortOrder: 0,
  source: 'formula', suppressed: false, note: null,
})

const catalog: Item[] = [
  item('ups_1500va', 'power', 'UPS 1500 VA'),
  item('display', 'court', 'Samsung 65in'),
  item('cat6_0m5', 'cable', 'Vention Cat6 0.5M'),
  item('access_point', 'network', 'UniFi U7-LR'),
]

const lines: StoredLine[] = [
  line('ups_1500va', 1), line('display', 8),
  line('cat6_0m5', 26), line('access_point', 'TBD'),
]

const names = (rows: string[][]) => rows.map(r => r[0])

describe('the exported body', () => {
  // The screen groups; a flat printout would hand the person on site a
  // differently organised document to the one that was sized. Needs a decision
  // is deliberately absent — see the TBD tests below.
  it('groups into Rack and Court-side, in that order', () => {
    const { rows, headerRowIndices } = buildPdfBody(lines, catalog)
    const headers = [...headerRowIndices].sort((a, b) => a - b).map(i => rows[i][0])
    expect(headers).toEqual(['Rack', 'Court-side'])
  })

  // The user's requirement: cable lengths are not committed to in a BOM.
  it('omits cabling entirely, for any account', () => {
    const { rows } = buildPdfBody(lines, catalog)
    expect(names(rows)).not.toContain('Vention Cat6 0.5M')
    expect(names(rows)).not.toContain('Cabling')
  })

  // The user's requirement: a quantity nobody has settled does not belong on a
  // sheet handed to whoever is ordering. Access points are the case that makes
  // this bite — perCourt.ts emits them TBD for every venue, so this assertion
  // is about every export, not an edge case.
  it('omits a TBD line rather than printing an unsettled quantity', () => {
    const { rows } = buildPdfBody(lines, catalog)
    expect(names(rows)).not.toContain('UniFi U7-LR')
    expect(rows.some(r => r[1] === 'TBD')).toBe(false)
  })

  // The other half of that requirement, and the reason dropping it is safe:
  // the line is not lost, it is still on the screen waiting to be settled. If
  // this ever fails, the PDF is not hiding the line — the tool is losing it.
  it('leaves a dropped TBD line visible on the screen', () => {
    const onScreen = groupIntoSections(lines, catalog)
      .flatMap(s => s.lines).map(l => l.roleKey)
    expect(onScreen).toContain('access_point')
  })

  // An unmapped line has no item and so no name to print. It is a data problem
  // to fix on the screen, not a row to hand someone: the placeholder it used to
  // print told the reader nothing they could act on.
  it('omits an unmapped line instead of printing a placeholder', () => {
    const orphan: StoredLine = { ...line('flic', 4), itemId: '' }
    const { rows } = buildPdfBody([...lines, orphan], catalog)
    expect(names(rows).some(n => n.includes('NO ITEM MAPPED'))).toBe(false)
    expect(rows.some(r => r[1] === '—')).toBe(false)
  })

  // C2: the 'flic' fixture above proves nothing about a CONTESTED role,
  // because this file's catalog holds no 'flic' item at all — byRole.get
  // returns undefined regardless of the fix, so that test would pass even if
  // buildPdfBody resolved empty itemIds through byRole. A role with two
  // active items is the reachable case: mergeRecalculation mints a
  // ROLE_NO_DEFAULT line with itemId '', and resolving it through byRole with
  // no `chosen` map would print an ARBITRARY one of the two contested items —
  // a SKU nobody chose, on a sheet handed to whoever is ordering, for a role
  // the engine sized as zero watts. Both names must be absent, not just one.
  it('omits a ROLE_NO_DEFAULT line even when its role has active items to pick from', () => {
    const contested: Item[] = [
      ...catalog,
      item('replay_camera', 'camera', 'Uniview Owlview'),
      { ...item('replay_camera', 'camera', 'Dahua 5459T'), id: 'id-replay_camera-2' },
    ]
    const unresolved: StoredLine = { ...line('replay_camera', 8), itemId: '' }
    const { rows } = buildPdfBody([unresolved], contested)
    expect(names(rows)).not.toContain('Uniview Owlview')
    expect(names(rows)).not.toContain('Dahua 5459T')
  })

  // groupIntoSections (the screen) resolves the section by roleKey only, and a
  // line whose roleKey does not resolve is unsettled — the screen files it
  // under Needs a decision. The PDF must decide the same way and then drop it.
  // Sectioning by the itemId-resolved item's category instead would land this
  // line under Rack on paper while the screen calls it unresolved, which is the
  // failure this guards: itemId here deliberately resolves to a different item
  // than roleKey would.
  it('drops what the screen files under Needs a decision', () => {
    const divergent: StoredLine = {
      ...line('ups_1500va', 1), roleKey: 'flic', itemId: 'id-ups_1500va',
    }
    expect(groupIntoSections([divergent], catalog)[0].label).toBe('Needs a decision')
    expect(buildPdfBody([divergent], catalog).rows).toEqual([])
  })

  // itemId is authoritative for the NAME, roleKey for the SECTION, and the two
  // are resolved separately. This line points its itemId at the UPS while its
  // roleKey says display, so it only passes if the name comes off itemId and
  // the group off roleKey — collapsing either onto the other flips one of these
  // assertions. The deactivated/null-roleKey variants of this used to live here
  // too; those lines are now dropped outright, so this is the reachable case.
  it('takes the name from itemId and the section from roleKey', () => {
    const divergent: StoredLine = {
      ...line('ups_1500va', 1), roleKey: 'display', itemId: 'id-ups_1500va',
    }
    const { rows, headerRowIndices } = buildPdfBody([divergent], catalog)
    expect(rows[[...headerRowIndices][0]][0]).toBe('Court-side')
    expect(names(rows)).toContain('UPS 1500 VA')
  })

  // items.role_key is nullable (0001_schema.sql) and listLines maps a null
  // role key straight through to StoredLine.roleKey, so a real line can point
  // at a cable item by itemId while roleKey is null. sectionForLine resolves
  // roleKey only, so with a null roleKey it falls through to 'decide' and
  // never reports 'cabling' — the exclusion has to be decided from the
  // itemId-resolved item, not from sectionForLine, or this cable line prints.
  it('omits a cable line whose roleKey is null, itemId included', () => {
    const orphanCable: Item = {
      ...item('cat6_1m', 'cable', 'Orphan Cat6 Cable'), roleKey: null,
    }
    const orphanLine: StoredLine = {
      ...line('cat6_1m', 3), roleKey: null,
    }
    const { rows } = buildPdfBody([orphanLine], [...catalog, orphanCable])
    expect(names(rows)).not.toContain('Orphan Cat6 Cable')
  })

  // VenueDetail passes exportMaterialsPdf the catalog including deactivated
  // items (catalogAll), so a line pointing at a deactivated cable item now
  // resolves and must still be excluded. Mirrors the deactivation shape used
  // above ('still prints the itemId-resolved name...'): retiring an item
  // clears its roleKey once a replacement claims the role, exactly like the
  // 'Retired KSTAR UPS' fixture there — the difference here is the category
  // is cable, so instead of asserting the name survives, this asserts it
  // never reaches the page.
  it('omits a deactivated cable line even though itemId still resolves it', () => {
    const retiredCable: Item = {
      ...item('cat6_3m', 'cable', 'Retired Cat6 Cable'), roleKey: null, isActive: false,
    }
    const retiredLine: StoredLine = { ...line('cat6_3m', 3), roleKey: null }
    const { rows } = buildPdfBody([retiredLine], [...catalog, retiredCable])
    expect(names(rows)).not.toContain('Retired Cat6 Cable')
  })

  it('excludes suppressed lines', () => {
    const { rows } = buildPdfBody(
      [{ ...line('display', 8), suppressed: true }], catalog,
    )
    expect(names(rows)).not.toContain('Samsung 65in')
  })

  // VenueDetail wires exportMaterialsPdf with catalogAll (listItems(true)),
  // which includes deactivated items in the same array as active ones — not
  // a separate lookup layered on top. This fixture matches that: the item
  // stays isActive: false but keeps its roleKey, which is the ordinary
  // deactivation case (as opposed to the roleKey-nulled-out case covered
  // above). A deactivated item's line must still carry a real name and a
  // real quantity — never the unmapped placeholder, never a dash.
  it('prints a deactivated item\'s line with its name and its quantity', () => {
    const deactivated = catalog.map(i =>
      i.roleKey === 'ups_1500va' ? { ...i, isActive: false } : i)
    const { rows } = buildPdfBody([line('ups_1500va', 2)], deactivated)
    const row = rows.find(r => r[0] === 'UPS 1500 VA')
    expect(row).toBeDefined()
    expect(row?.[1]).toBe('2')
    expect(names(rows).some(n => n.includes('NO ITEM MAPPED'))).toBe(false)
    expect(rows.some(r => r[1] === '—')).toBe(false)
  })

  // notes are internal working notes — supplier terms, cost commentary — and
  // must never reach a document handed to a client. Every other fixture in
  // this file leaves notes: null, which would pass even if buildPdfBody
  // printed it; this uses a distinctive value so the assertion is real.
  it('never lets an item\'s internal notes reach a printed row', () => {
    const noted = catalog.map(i =>
      i.roleKey === 'ups_1500va' ? { ...i, notes: 'ACME distributor cost markup 40%' } : i)
    const { rows } = buildPdfBody([line('ups_1500va', 1)], noted)
    expect(rows.flat().some(cell => cell.includes('ACME distributor cost markup 40%')))
      .toBe(false)
  })

  // print_note travels with the item onto the handed-out list; `notes` never
  // does. The note must stay under its own line, inside its own group.
  it('keeps a print note directly below its line', () => {
    const noted = catalog.map(i =>
      i.roleKey === 'ups_1500va' ? { ...i, printNote: 'Rack-mount kit required' } : i)
    const { rows } = buildPdfBody([line('ups_1500va', 1)], noted)
    expect(rows[0][0]).toBe('Rack')
    expect(rows[1][0]).toBe('UPS 1500 VA')
    expect(rows[2][0]).toContain('Rack-mount kit required')
  })

  /**
   * A print note is a constraint hanging off the line above it, not an item of
   * its own, and it is the longest text on the sheet — the UPS note ran to
   * seven lines at the same size and weight as the hardware, so the eye lost
   * the list inside the prose. Reported by index for the same reason the
   * section headers are: autoTable styles cells through didParseCell, which
   * only knows a row number.
   */
  it('reports which rows are notes rather than items', () => {
    const noted = catalog.map(i =>
      i.roleKey === 'ups_1500va' ? { ...i, printNote: 'Rack-mount kit required' } : i)
    const { rows, noteRowIndices } = buildPdfBody([line('ups_1500va', 1)], noted)
    expect([...noteRowIndices]).toEqual([2])
    expect(rows[2][0]).toContain('Rack-mount kit required')
  })
})

type HookData = {
  section: string
  row: { index: number }
  cell: { styles: Record<string, unknown> }
}

describe('how a note row is drawn', () => {
  const noted = catalog.map(i =>
    i.roleKey === 'ups_1500va' ? { ...i, printNote: 'Rack-mount kit required' } : i)

  const styleOf = (index: number) => {
    exportMaterialsPdf('Tela Park', 'Pro', [line('ups_1500va', 1)], noted, inputs)
    const didParseCell = lastOptions.current?.didParseCell as (d: HookData) => void
    const cell = { styles: {} as Record<string, unknown> }
    didParseCell({ section: 'body', row: { index }, cell })
    return cell.styles
  }

  it('sets a note smaller and italic, so the list reads as the list', () => {
    const styles = styleOf(2)
    expect(styles.fontStyle).toBe('italic')
    expect(styles.fontSize).toBe(8)
  })

  // Grey, but not so grey it stops surviving a photocopy — this is a
  // constraint the buyer has to act on, only a subordinate one.
  it('greys a note without dropping it out of the page', () => {
    expect(styleOf(2).textColor).toEqual([90, 90, 90])
  })

  it('leaves the item row it hangs off alone', () => {
    expect(styleOf(1)).toEqual({})
  })
})

describe('the exported PDF footer', () => {
  // The footer sentence is the only thing that keeps the two omissions from
  // being silent — buildPdfBody's rows never mention cabling or the dropped
  // TBD lines once they're excluded, so nothing else in this file would catch
  // the footer being deleted. Deleting it keeps every other test here green.
  //
  // The TBD half matters more than the cabling half: access points are TBD for
  // every venue, so every sheet is missing them, and a reader with no note
  // would have no way to know the list is not a complete order.
  it('states that cabling and unconfirmed quantities are excluded', () => {
    textCalls.length = 0
    exportMaterialsPdf('Test Venue', 'Pro', lines, catalog, inputs)
    const note = textCalls.find(t => t.startsWith('Cabling'))
    expect(note).toBeDefined()
    expect(note).toContain('quantities still to be confirmed')
    expect(note).toContain('excluded from this list')
  })
})

describe('the exported PDF header', () => {
  // This sheet is handed to a client, and it carries no prices by design —
  // that omission is enforced elsewhere in this file. The title has to keep
  // describing the contents, or the document promises something it lacks.
  it('is titled for the hardware it lists, never for pricing it does not carry', () => {
    textCalls.length = 0
    exportMaterialsPdf('Test Venue', 'Pro', lines, catalog, inputs)
    expect(textCalls.some(t => t.includes('HARDWARE ITEMS'))).toBe(true)
    expect(textCalls.some(t => /pricing|price|cost|₱/i.test(t))).toBe(false)
  })

  // The sheet is handed to a client, so it prints the display name it was
  // given. Printing the raw stored value would put "autonomous_plus" on a
  // customer-facing document.
  it('prints the display name it was given, not a stored tier key', () => {
    textCalls.length = 0
    exportMaterialsPdf('Test Venue', 'Autonomous+', lines, catalog, inputs)
    expect(textCalls.some(t => t === 'Tier: Autonomous+')).toBe(true)
    expect(textCalls.some(t => /basic_plus|autonomous_plus/.test(t))).toBe(false)
  })
})

describe('the Kosmas letterhead', () => {
  const reset = () => {
    textCalls.length = 0
    imageCalls.length = 0
    tableEnd.finalY = undefined
  }

  const bandsOn = (page: number) =>
    imageCalls.filter(c => c.page === page).map(c => c.data)

  // This sheet is handed to a client alongside quotes and letters that all come
  // out of the same corporate template, so it carries the same two bands. Both,
  // not just the logo: the contact strip is how the person holding the printout
  // reaches Kosmas about what is on it.
  it('puts the logo band and the contact strip on the page', () => {
    reset()
    exportMaterialsPdf('Test Venue', 'Pro', lines, catalog, inputs)
    expect(bandsOn(1)).toEqual([HEADER_PNG, FOOTER_PNG])
  })

  // A materials list is routinely longer than one page. Branding only the first
  // would hand over a document whose later pages — the ones with the court-side
  // hardware on them — look like they came from nobody.
  it('bands every page, not only the first', () => {
    reset()
    // Forces the second page: the note no longer fits above the contact strip.
    tableEnd.finalY = FOOTER_BAND.y - 10
    exportMaterialsPdf('Test Venue', 'Pro', lines, catalog, inputs)
    expect(bandsOn(1)).toEqual([HEADER_PNG, FOOTER_PNG])
    expect(bandsOn(2)).toEqual([HEADER_PNG, FOOTER_PNG])
  })

  // The cabling sentence is the only thing that explains the gap in the list.
  // Before the bands existed it could run off the bottom of the page unnoticed;
  // now it would print underneath the contact strip, which is worse — it would
  // look present in the code and be unreadable on paper. It gets a page.
  it('never lets the cabling note print under the contact strip', () => {
    reset()
    tableEnd.finalY = FOOTER_BAND.y - 10
    exportMaterialsPdf('Test Venue', 'Pro', lines, catalog, inputs)
    expect(textCalls.some(t => t.startsWith('Cabling'))).toBe(true)
    expect(imageCalls.some(c => c.page === 2)).toBe(true)
  })

  // The counterpart to the test above: a short list must not be padded with an
  // empty second page just because the overflow branch exists.
  it('stays on one page when the note fits', () => {
    reset()
    tableEnd.finalY = 120
    exportMaterialsPdf('Test Venue', 'Pro', lines, catalog, inputs)
    expect(imageCalls.every(c => c.page === 1)).toBe(true)
  })
})

describe('port template pages', () => {

  // The letterhead crops are 210mm full-bleed artwork sized for A4 portrait.
  // Stretching either onto a 420mm A3 page distorts the mark, which the brand
  // book forbids outright — so stampLetterhead must stop at the last hardware
  // page rather than looping every page in the document.
  it('stamps the letterhead on the hardware pages only', () => {
    const doc = new jsPDF()
    doc.addPage()                       // a second hardware page
    doc.addPage('a3', 'landscape')      // the port page
    imageCalls.length = 0
    stampLetterhead(doc, 2)
    // Two bands per page, over two pages — and nothing on page 3.
    expect(imageCalls).toHaveLength(4)
    expect(imageCalls.some(c => c.page === 3)).toBe(false)
  })

  // The claim is that the venue's inputs reach the port plan. A no-op
  // appendPortTemplate would pass a "does not throw" test identically, so
  // assert the page is actually there — and absent for a tier with no hardware.
  it('draws a port page for a Pro venue', () => {
    textCalls.length = 0
    exportMaterialsPdf('V', 'Pro', [], [], inputs)
    expect(textCalls).toContain('PORT TEMPLATE')
  })

  // The venue NAME is deliberately gone from the filename. Two venues of the
  // same court count therefore export to the same name — asserted here so that
  // is a recorded decision rather than something noticed at a download prompt.
  it('names the file for the court count, not the venue', () => {
    saveCalls.length = 0
    exportMaterialsPdf('Tela Park', 'Pro', [], [], { ...inputs, courts: 6 })
    expect(saveCalls).toEqual(['6-court-venue-hardware.pdf'])

    exportMaterialsPdf('Helios Beta', 'Pro', [], [], { ...inputs, courts: 6 })
    expect(saveCalls[1]).toBe('6-court-venue-hardware.pdf')
  })

  it('draws none for a tier the gates block', () => {
    textCalls.length = 0
    exportMaterialsPdf('V', 'Basic', [], [], { ...inputs, tier: 'basic' as const })
    expect(textCalls).not.toContain('PORT TEMPLATE')
  })
})
