import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Item } from '@/calculator/types'
import type { StoredLine } from '@/data/venueLines'

/**
 * Layout mirrors Tela Park Pricing.docx: a single flat table, no category
 * grouping and no section headers. Prices are never included — quotes differ
 * per deal. Warnings are never included — they are internal working notes and
 * this document gets handed to someone.
 */
export function exportMaterialsPdf(
  venueName: string,
  lines: StoredLine[],
  catalog: Item[],
): void {
  const byId = new Map(catalog.map(i => [i.id, i]))
  const byRole = new Map(catalog.filter(i => i.roleKey).map(i => [i.roleKey!, i]))
  const doc = new jsPDF()

  doc.setFontSize(16)
  doc.text('MATERIALS', 14, 20)
  doc.setFontSize(12)
  doc.text(venueName, 14, 28)
  doc.setFontSize(10)
  doc.text(`Date: ${new Date().toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
  })}`, 14, 35)

  const body: string[][] = []
  for (const line of lines) {
    if (line.suppressed) continue

    // itemId is authoritative and survives deactivation; the role lookup is
    // the fallback for freshly calculated lines that have not been saved yet.
    const item =
      byId.get(line.itemId) ??
      (line.roleKey ? byRole.get(line.roleKey) : undefined)

    // An unmapped role is printed explicitly. Dropping it silently would make
    // the handed-out list quietly incomplete, which is the one failure this
    // document cannot afford.
    if (!item) {
      body.push([`[NO ITEM MAPPED: ${line.roleKey ?? 'unknown'}]`, '—'])
      continue
    }

    body.push([item.name, line.qty === 'TBD' ? 'TBD' : String(line.qty)])

    // print_note only — `notes` are internal working notes and must not reach
    // a document that gets handed to someone.
    if (item.printNote) body.push([`    ${item.printNote}`, ''])
  }

  autoTable(doc, {
    startY: 42,
    head: [['Item / Model', 'Qty']],
    body,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [40, 40, 40] },
    columnStyles: { 1: { halign: 'right', cellWidth: 20 } },
  })

  doc.save(`materials-${venueName.toLowerCase().replace(/\s+/g, '-')}.pdf`)
}
