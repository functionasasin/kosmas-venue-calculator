import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Item } from '@/calculator/types'
import type { StoredLine } from '@/data/venueLines'
import type { SectionId } from '@/lib/sections'
import { SECTION_LABELS, itemsByRole, sectionForItem, sectionForLine } from '@/lib/sections'
import {
  FOOTER_BAND, FOOTER_PNG, HEADER_BAND, HEADER_PNG, KOSMAS_NAVY, KOSMAS_NAVY_TINT,
} from './letterhead'

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

    // Two separate questions, deliberately answered from two different
    // resolutions of the item. Whether the line PRINTS is decided from the
    // itemId-resolved `item` above — that is the item whose name is about to
    // go on the page, so it is the one whose category has to be checked. A
    // line with a null roleKey but an itemId that resolves to a cable item
    // would otherwise fall through: sectionForLine sees no roleKey, returns
    // 'decide', and the cabling exclusion never fires.
    if (sectionForItem(item) === 'cabling') continue

    // Which GROUP the line prints under is a different question, and stays on
    // sectionForLine, which resolves by roleKey only — exactly what
    // groupIntoSections does on screen — and already folds in the TBD
    // override. Sectioning by the itemId item's category instead would let a
    // line whose roleKey doesn't resolve (e.g. a NULL items.role_key, as
    // listLines produces) land in a different section on paper than
    // groupIntoSections puts it in on screen. itemId is right for the name
    // and for the cabling check; only roleKey is right for the group.
    const section = sectionForLine(line, byRole)

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

/** First line the letterhead leaves free, and where the title block starts. */
const CONTENT_TOP = HEADER_BAND.h + 6
const TITLE_Y = CONTENT_TOP + 4

/** Lowest baseline the closing note can take and still clear the contact strip. */
const NOTE_MAX_Y = FOOTER_BAND.y - 5

/**
 * Stamped last, over every page the document ended up with, so a table that
 * spilled onto page three is banded too. Both crops are opaque white outside
 * the artwork, which is why this runs after the content is laid out rather than
 * from autoTable's didDrawPage — the margins above keep the content out of the
 * bands, and drawing last means a stray overlap covers the band, never the
 * hardware list.
 */
function stampLetterhead(doc: jsPDF): void {
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page)
    doc.addImage(
      HEADER_PNG, 'PNG', HEADER_BAND.x, HEADER_BAND.y, HEADER_BAND.w, HEADER_BAND.h,
    )
    doc.addImage(
      FOOTER_PNG, 'PNG', FOOTER_BAND.x, FOOTER_BAND.y, FOOTER_BAND.w, FOOTER_BAND.h,
    )
  }
}

/**
 * `tierLabel` is passed in already resolved rather than derived here, so the
 * PDF and the screen cannot disagree about what a venue is called. Nothing
 * about the tier is inferred from the hardware counts: Basic and Basic+ are
 * identical in hardware, so there would be nothing to infer it from.
 *
 * Titled "HARDWARE ITEMS" — it describes what is on the page. The sheet carries
 * no prices, and that exclusion is deliberate and tested, so a pricing-flavoured
 * title would promise something the document does not contain.
 *
 * The page is the Kosmas corporate letterhead: same bands, same brand navy as
 * `Corporate Letter Format_V4.0.docx`. What the sheet says and the order it says
 * it in is unchanged — only the palette and the two bands are new. This document
 * is handed to a client, so it should look like it came from the same company as
 * every other letter they get.
 */
export function exportMaterialsPdf(
  venueName: string,
  tierLabel: string,
  lines: StoredLine[],
  catalog: Item[],
): void {
  const doc = new jsPDF()

  doc.setTextColor(...KOSMAS_NAVY)
  doc.setFontSize(16)
  doc.text('HARDWARE ITEMS', 14, TITLE_Y)
  doc.setFontSize(12)
  doc.text(venueName, 14, TITLE_Y + 8)
  doc.setTextColor(60, 60, 60)
  doc.setFontSize(10)
  doc.text(`Tier: ${tierLabel}`, 14, TITLE_Y + 15)
  doc.text(`Date: ${new Date().toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
  })}`, 14, TITLE_Y + 21)

  const { rows, headerRowIndices } = buildPdfBody(lines, catalog)

  autoTable(doc, {
    startY: TITLE_Y + 28,
    // Keeps a table that runs onto a second page clear of the bands, which are
    // stamped after the fact and would otherwise paint over the top and bottom
    // rows. On page one startY already clears the header.
    margin: { top: CONTENT_TOP, bottom: 297 - FOOTER_BAND.y + 8 },
    head: [['Item / Model', 'Qty']],
    body: rows,
    styles: { fontSize: 9 },
    headStyles: { fillColor: KOSMAS_NAVY },
    columnStyles: { 1: { halign: 'right', cellWidth: 20 } },
    didParseCell: data => {
      if (data.section === 'body' && headerRowIndices.has(data.row.index)) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fillColor = KOSMAS_NAVY_TINT
        data.cell.styles.textColor = KOSMAS_NAVY
      }
    },
  })

  const finalY =
    (doc as unknown as { lastAutoTable?: { finalY: number } })
      .lastAutoTable?.finalY ?? TITLE_Y + 28

  // A table ending near the bottom used to push this sentence off the page
  // silently; now it would also land under the contact strip. The sentence is
  // the only thing keeping the cabling omission from being unexplained, so it
  // gets its own page rather than being dropped or overprinted.
  let noteY = finalY + 8
  if (noteY > NOTE_MAX_Y) {
    doc.addPage()
    noteY = CONTENT_TOP + 4
  }
  doc.setTextColor(60, 60, 60)
  doc.setFontSize(8)
  doc.text(
    'Cabling is specified separately and is excluded from this list.',
    14, noteY,
  )

  stampLetterhead(doc)

  doc.save(`hardware-items-${venueName.toLowerCase().replace(/\s+/g, '-')}.pdf`)
}
