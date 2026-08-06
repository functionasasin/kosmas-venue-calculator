import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Item } from '@/calculator/types'
import type { StoredLine } from '@/data/venueLines'
import type { SectionId } from '@/lib/sections'
import { SECTION_LABELS, itemsByRole, sectionForLine } from '@/lib/sections'

/**
 * Grouped to mirror the screen: whoever holds the printout should be reading
 * the same document the venue was sized in. Prices are never included — quotes
 * differ per deal. Warnings are never included — they are internal working
 * notes and this document gets handed to someone.
 *
 * Cabling is omitted for every account, admin included. The omission is stated
 * in the footer rather than left silent, because an unexplained gap in a
 * handed-out list is the one failure this document cannot afford.
 */
const PRINT_ORDER: SectionId[] = ['rack', 'court', 'decide']

export function buildPdfBody(
  lines: StoredLine[], catalog: Item[],
): { rows: string[][]; headerRowIndices: Set<number> } {
  const byId = new Map(catalog.map(i => [i.id, i]))
  const byRole = itemsByRole(catalog)

  const buckets = new Map<SectionId, string[][]>()
  const push = (id: SectionId, row: string[]) => {
    const bucket = buckets.get(id)
    if (bucket) bucket.push(row)
    else buckets.set(id, [row])
  }

  for (const line of lines) {
    if (line.suppressed) continue

    // Name resolution: itemId is authoritative and survives deactivation or a
    // role being reassigned elsewhere; the roleKey lookup is only the fallback
    // for a freshly calculated line that has not been saved yet.
    const item =
      byId.get(line.itemId) ??
      (line.roleKey ? byRole.get(line.roleKey) : undefined)

    // An unmapped role is printed explicitly, in Needs a decision — it has no
    // item and so no category, and it is precisely an unresolved line.
    if (!item) {
      push('decide', [`[NO ITEM MAPPED: ${line.roleKey ?? 'unknown'}]`, '—'])
      continue
    }

    // Section resolution deliberately does NOT use the itemId-resolved `item`
    // above. sectionForLine resolves by roleKey only — exactly what
    // groupIntoSections does on screen — and already folds in the TBD
    // override, so it is not reapplied here. Sectioning by the itemId item's
    // category instead would let a line whose roleKey doesn't resolve (e.g. a
    // NULL items.role_key, as listLines produces) land in a different section
    // on paper than groupIntoSections puts it in on screen. itemId is right
    // for the name; only roleKey is right for the section.
    const section = sectionForLine(line, byRole)
    if (section === 'cabling') continue

    push(section, [item.name, line.qty === 'TBD' ? 'TBD' : String(line.qty)])

    // print_note only — `notes` are internal working notes and must not reach
    // a document that gets handed to someone. It stays under its own line.
    if (item.printNote) push(section, [`    ${item.printNote}`, ''])
  }

  const rows: string[][] = []
  const headerRowIndices = new Set<number>()
  for (const id of PRINT_ORDER) {
    const bucket = buckets.get(id)
    if (!bucket || bucket.length === 0) continue
    headerRowIndices.add(rows.length)
    rows.push([SECTION_LABELS[id], ''])
    rows.push(...bucket)
  }

  return { rows, headerRowIndices }
}

export function exportMaterialsPdf(
  venueName: string,
  lines: StoredLine[],
  catalog: Item[],
): void {
  const doc = new jsPDF()

  doc.setFontSize(16)
  doc.text('MATERIALS', 14, 20)
  doc.setFontSize(12)
  doc.text(venueName, 14, 28)
  doc.setFontSize(10)
  doc.text(`Date: ${new Date().toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
  })}`, 14, 35)

  const { rows, headerRowIndices } = buildPdfBody(lines, catalog)

  autoTable(doc, {
    startY: 42,
    head: [['Item / Model', 'Qty']],
    body: rows,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [40, 40, 40] },
    columnStyles: { 1: { halign: 'right', cellWidth: 20 } },
    didParseCell: data => {
      if (data.section === 'body' && headerRowIndices.has(data.row.index)) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fillColor = [235, 235, 235]
      }
    },
  })

  const finalY =
    (doc as unknown as { lastAutoTable?: { finalY: number } })
      .lastAutoTable?.finalY ?? 42
  doc.setFontSize(8)
  doc.text(
    'Cabling is specified separately and is excluded from this list.',
    14, finalY + 8,
  )

  doc.save(`materials-${venueName.toLowerCase().replace(/\s+/g, '-')}.pdf`)
}
