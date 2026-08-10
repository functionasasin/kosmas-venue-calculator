import { describe, it, expect, vi } from 'vitest'
import type { Item } from '@/calculator/types'
import type { RoleKey } from '@/calculator/roleKeys'
import type { StoredLine } from '@/data/venueLines'
import { groupIntoSections } from '@/lib/sections'
import { buildPdfBody, exportMaterialsPdf } from './exportMaterials'

// exportMaterialsPdf is exercised (rather than only buildPdfBody) for the
// footer test below, since the footer sentence is drawn directly with
// doc.text and never passes through buildPdfBody's rows. jsPDF and
// jspdf-autotable are stubbed because they draw vector graphics that jsdom
// has no reason to be exercised by in a unit test — only the calls to
// `text` matter here.
const { textCalls } = vi.hoisted(() => ({ textCalls: [] as string[] }))
vi.mock('jspdf', () => {
  class FakeJsPDF {
    setFontSize() { return this }
    text(str: string) { textCalls.push(str); return this }
    save() { /* no-op: no real download in a unit test */ }
  }
  return { default: FakeJsPDF }
})
vi.mock('jspdf-autotable', () => ({ default: vi.fn() }))

const item = (roleKey: RoleKey, category: string, name: string): Item => ({
  id: `id-${roleKey}`, name, category, roleKey,
  supplier: null, poeWatts: null, rackU: null, unitPrice: null,
  currency: null, isActive: true, notes: null, printNote: null,
})

const line = (roleKey: RoleKey, qty: StoredLine['qty']): StoredLine => ({
  id: `line-${roleKey}`, venueId: 'v', itemId: `id-${roleKey}`,
  roleKey, qty, originRoleKey: null, sortOrder: 0,
  source: 'formula', suppressed: false, note: null,
})

const catalog: Item[] = [
  item('ups', 'power', 'KSTAR UPS'),
  item('display', 'court', 'Samsung 65in'),
  item('cat6_0m5', 'cable', 'Vention Cat6 0.5M'),
  item('access_point', 'network', 'UniFi U7-LR'),
]

const lines: StoredLine[] = [
  line('ups', 1), line('display', 8),
  line('cat6_0m5', 26), line('access_point', 'TBD'),
]

const names = (rows: string[][]) => rows.map(r => r[0])

describe('the exported body', () => {
  // The screen groups; a flat printout would hand the person on site a
  // differently organised document to the one that was sized.
  it('groups into Rack, Court-side and Needs a decision, in that order', () => {
    const { rows, headerRowIndices } = buildPdfBody(lines, catalog)
    const headers = [...headerRowIndices].sort((a, b) => a - b).map(i => rows[i][0])
    expect(headers).toEqual(['Rack', 'Court-side', 'Needs a decision'])
  })

  // The user's requirement: cable lengths are not committed to in a BOM.
  it('omits cabling entirely, for any account', () => {
    const { rows } = buildPdfBody(lines, catalog)
    expect(names(rows)).not.toContain('Vention Cat6 0.5M')
    expect(names(rows)).not.toContain('Cabling')
  })

  it('prints a TBD as TBD rather than as a number', () => {
    const { rows } = buildPdfBody(lines, catalog)
    const ap = rows.find(r => r[0] === 'UniFi U7-LR')
    expect(ap?.[1]).toBe('TBD')
  })

  it('puts Needs a decision last so an unresolved line ends the document', () => {
    const { rows, headerRowIndices } = buildPdfBody(lines, catalog)
    const last = Math.max(...headerRowIndices)
    expect(rows[last][0]).toBe('Needs a decision')
  })

  // An unmapped line has no item and therefore no category. Dropping it would
  // make the handed-out list quietly incomplete.
  it('keeps an unmapped line, in Needs a decision', () => {
    const orphan: StoredLine = { ...line('flic', 4), itemId: '' }
    const { rows } = buildPdfBody([...lines, orphan], catalog)
    expect(names(rows).some(n => n.includes('NO ITEM MAPPED'))).toBe(true)
  })

  // groupIntoSections (the screen) resolves the section by roleKey only. If
  // buildPdfBody instead sectioned by the itemId-resolved item's category, a
  // line whose roleKey does not resolve (e.g. items.role_key is NULL, as in
  // listLines) would land in Rack/Court-side on paper while the screen calls
  // it unresolved and puts it in Needs a decision. itemId here deliberately
  // resolves to a *different* item than roleKey would, so this only passes if
  // the section is derived the same way groupIntoSections derives it.
  it('agrees with the screen when roleKey does not resolve but itemId does', () => {
    const divergent: StoredLine = {
      ...line('ups', 1), roleKey: 'flic', itemId: 'id-ups',
    }
    const { rows, headerRowIndices } = buildPdfBody([divergent], catalog)
    const pdfSection = rows[[...headerRowIndices][0]][0]
    const screenSection = groupIntoSections([divergent], catalog)[0].label
    expect(pdfSection).toBe(screenSection)
    expect(pdfSection).toBe('Needs a decision')
  })

  // itemId resolution must survive even when the section can't resolve: the
  // name printed is still the itemId-pointed item's name, not a fabricated
  // "unmapped" placeholder — itemId is authoritative and its item is real,
  // only its role mapping is gone (e.g. deactivated, or role reassigned).
  it('still prints the itemId-resolved name when the item has no roleKey', () => {
    const deactivated = catalog.map(i =>
      i.roleKey === 'ups' ? { ...i, roleKey: null, isActive: false, name: 'Retired KSTAR UPS' } : i)
    const orphanedRole: StoredLine = { ...line('ups', 1), roleKey: null }
    const { rows } = buildPdfBody([orphanedRole], deactivated)
    expect(names(rows)).toContain('Retired KSTAR UPS')
    expect(names(rows).some(n => n.includes('NO ITEM MAPPED'))).toBe(false)
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
      i.roleKey === 'ups' ? { ...i, isActive: false } : i)
    const { rows } = buildPdfBody([line('ups', 2)], deactivated)
    const row = rows.find(r => r[0] === 'KSTAR UPS')
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
      i.roleKey === 'ups' ? { ...i, notes: 'ACME distributor cost markup 40%' } : i)
    const { rows } = buildPdfBody([line('ups', 1)], noted)
    expect(rows.flat().some(cell => cell.includes('ACME distributor cost markup 40%')))
      .toBe(false)
  })

  // print_note travels with the item onto the handed-out list; `notes` never
  // does. The note must stay under its own line, inside its own group.
  it('keeps a print note directly below its line', () => {
    const noted = catalog.map(i =>
      i.roleKey === 'ups' ? { ...i, printNote: 'Rack-mount kit required' } : i)
    const { rows } = buildPdfBody([line('ups', 1)], noted)
    expect(rows[0][0]).toBe('Rack')
    expect(rows[1][0]).toBe('KSTAR UPS')
    expect(rows[2][0]).toContain('Rack-mount kit required')
  })
})

describe('the exported PDF footer', () => {
  // The footer sentence is the only thing that keeps the cabling omission
  // from being silent — buildPdfBody's rows never mention cabling once it's
  // excluded, so nothing else in this file would catch the footer being
  // deleted. Deleting it currently keeps every other test in this file green.
  it('states that cabling is excluded, on every export', () => {
    textCalls.length = 0
    exportMaterialsPdf('Test Venue', 'Pro', lines, catalog)
    expect(textCalls.some(t =>
      t.includes('Cabling is specified separately and is excluded from this list.'),
    )).toBe(true)
  })
})

describe('the exported PDF header', () => {
  // This sheet is handed to a client, and it carries no prices by design —
  // that omission is enforced elsewhere in this file. The title has to keep
  // describing the contents, or the document promises something it lacks.
  it('is titled for the hardware it lists, never for pricing it does not carry', () => {
    textCalls.length = 0
    exportMaterialsPdf('Test Venue', 'Pro', lines, catalog)
    expect(textCalls.some(t => t.includes('HARDWARE ITEMS'))).toBe(true)
    expect(textCalls.some(t => /pricing|price|cost|₱/i.test(t))).toBe(false)
  })

  // Pro and Pro+ are one stored tier resolved from the door and camera counts,
  // so the sheet prints whichever the venue actually is. Printing the raw
  // stored value would label every Pro+ deployment "pro" on the handout.
  it('prints the resolved tier it was given, not a stored tier key', () => {
    textCalls.length = 0
    exportMaterialsPdf('Test Venue', 'Pro+', lines, catalog)
    expect(textCalls.some(t => t === 'Tier: Pro+')).toBe(true)
    expect(textCalls.some(t => /pro_plus|basic_plus|autonomous_plus/.test(t))).toBe(false)
  })
})
