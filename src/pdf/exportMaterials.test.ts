import { describe, it, expect } from 'vitest'
import type { Item } from '@/calculator/types'
import type { RoleKey } from '@/calculator/roleKeys'
import type { StoredLine } from '@/data/venueLines'
import { groupIntoSections } from '@/lib/sections'
import { buildPdfBody } from './exportMaterials'

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

  it('excludes suppressed lines', () => {
    const { rows } = buildPdfBody(
      [{ ...line('display', 8), suppressed: true }], catalog,
    )
    expect(names(rows)).not.toContain('Samsung 65in')
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
