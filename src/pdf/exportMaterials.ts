import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Item } from '@/calculator/types'
import type { StoredLine } from '@/data/venueLines'
import type { SectionId } from '@/lib/sections'
import {
  SECTION_LABELS, itemsById, itemsByRole, resolveLineItem, sectionForItem,
  sectionForLine,
} from '@/lib/sections'
import {
  FOOTER_BAND, FOOTER_PNG, HEADER_BAND, HEADER_PNG, KOSMAS_NAVY, KOSMAS_NAVY_TINT,
} from './letterhead'

/**
 * Grouped to mirror the screen: whoever holds the printout should be reading
 * the same document the venue was sized in. Prices are never included — quotes
 * differ per deal. Warnings are never included — they are internal working
 * notes and this document gets handed to someone.
 *
 * Cabling is omitted for every account, admin included. So is everything that
 * would land in "Needs a decision": a TBD quantity, a role that maps to no
 * item, an unrecognised category. A line nobody has settled yet does not belong
 * on a sheet handed to whoever is ordering — the screen still carries it, and
 * the screen is where it gets settled. Both omissions are stated in the footer
 * rather than left silent, because an unexplained gap in a handed-out list is
 * the one failure this document cannot afford.
 *
 * Access points are what makes that footer load-bearing rather than decorative:
 * perCourt.ts emits them 'TBD' for every venue, because the count is a coverage
 * decision and never a formula output, so they reach no exported BOM at all.
 * The sheet is therefore not a complete order on its own, and says so.
 */
const PRINT_ORDER: SectionId[] = ['rack', 'court']

/** The whitelist above, as a membership test — anything else is dropped. */
const PRINT_SECTIONS = new Set<SectionId>(PRINT_ORDER)

export function buildPdfBody(
  lines: StoredLine[], catalog: Item[],
): {
  rows: string[][]
  headerRowIndices: Set<number>
  /**
   * Print-note rows. A note is a constraint hanging off the line above it, not
   * an item of its own, and it is the longest text on the sheet — so it is
   * drawn smaller, italic and grey. autoTable styles cells through
   * didParseCell, which knows only a row number, which is why this leaves here
   * as indices rather than as a flag on the row.
   */
  noteRowIndices: Set<number>
} {
  const byId = itemsById(catalog)
  const byRole = itemsByRole(catalog)

  const buckets = new Map<SectionId, string[][]>()
  // The note ROWS themselves, not their offsets. A row's absolute index is not
  // known until the buckets are concatenated below, and translating a
  // per-bucket offset afterwards is arithmetic that quietly goes wrong the
  // first time anything is spliced in ahead of a note. Identity needs no
  // translation.
  const noteRows = new Set<string[]>()
  const push = (id: SectionId, row: string[], isNote = false) => {
    const bucket = buckets.get(id)
    if (bucket) bucket.push(row)
    else buckets.set(id, [row])
    if (isNote) noteRows.add(row)
  }

  for (const line of lines) {
    if (line.suppressed) continue

    // An empty itemId is what mergeRecalculation mints for ROLE_NO_DEFAULT —
    // a role that resolved to no item at all, left untouched, and refused by
    // saveVenueAndLines as an unresolved line. Falling through to the roleKey
    // lookup below would resolve it through byRole with no `chosen` map, and
    // for a role with several active items that picks one of them
    // ARBITRARILY — printing a SKU nobody chose, on a sheet handed to whoever
    // is ordering, for a role the engine sized as zero watts. It is a "needs
    // a decision" line by construction, so it is dropped with the rest of
    // that category rather than resolved at all.
    if (!line.itemId) continue

    // Name resolution, shared with the two on-screen sites — see
    // resolveLineItem. The empty-itemId case is handled above rather than by
    // that guard, because here the line is DROPPED entirely rather than
    // rendered without a name.
    const item = resolveLineItem(line, byId, byRole)

    // An unmapped role has no item and so no name to print — it is a data
    // problem to fix on the screen, not a line to hand someone. It used to
    // print as [NO ITEM MAPPED: …] under Needs a decision; with that section
    // gone there is nowhere honest to put it, so it is dropped like the rest.
    if (!item) continue

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

    // Drops the 'decide' lines — a TBD quantity, or a role that resolves to
    // nothing. Checked here rather than left to PRINT_ORDER silently skipping
    // the bucket, so that deleting a section from PRINT_ORDER cannot look like
    // a formatting change when it is really a change to what the sheet claims.
    if (!PRINT_SECTIONS.has(section)) continue

    // String() rather than a TBD ternary: sectionForLine sends every TBD line
    // to 'decide', so the guard above has already dropped them and a ternary
    // here would be an unreachable branch implying they can still print.
    push(section, [item.name, String(line.qty)])

    // print_note only — `notes` are internal working notes and must not reach
    // a document that gets handed to someone. It stays under its own line.
    if (item.printNote) push(section, [`    ${item.printNote}`, ''], true)
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

  const noteRowIndices = new Set(
    rows.flatMap((row, i) => (noteRows.has(row) ? [i] : [])),
  )

  return { rows, headerRowIndices, noteRowIndices }
}

/** Print notes are set down from the 9pt body, in grey rather than near-black. */
const NOTE_FONT_SIZE = 8
const NOTE_GREY: [number, number, number] = [90, 90, 90]

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

  const { rows, headerRowIndices, noteRowIndices } = buildPdfBody(lines, catalog)

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
      if (data.section !== 'body') return
      if (headerRowIndices.has(data.row.index)) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fillColor = KOSMAS_NAVY_TINT
        data.cell.styles.textColor = KOSMAS_NAVY
      }
      // Subordinate to the line it hangs off: smaller, italic, grey. Grey 90
      // and not lighter — it is still a constraint the buyer must act on, and
      // it has to survive a photocopy.
      if (noteRowIndices.has(data.row.index)) {
        data.cell.styles.fontStyle = 'italic'
        data.cell.styles.fontSize = NOTE_FONT_SIZE
        data.cell.styles.textColor = NOTE_GREY
      }
    },
  })

  const finalY =
    (doc as unknown as { lastAutoTable?: { finalY: number } })
      .lastAutoTable?.finalY ?? TITLE_Y + 28

  // A table ending near the bottom used to push this sentence off the page
  // silently; now it would also land under the contact strip. The sentence is
  // the only thing keeping the two omissions from being unexplained, so it
  // gets its own page rather than being dropped or overprinted.
  let noteY = finalY + 8
  if (noteY > NOTE_MAX_Y) {
    doc.addPage()
    noteY = CONTENT_TOP + 4
  }
  doc.setTextColor(60, 60, 60)
  doc.setFontSize(8)
  doc.text(
    'Cabling and any items with quantities still to be confirmed are specified '
    + 'separately and are excluded from this list.',
    14, noteY,
  )

  stampLetterhead(doc)

  doc.save(`hardware-items-${venueName.toLowerCase().replace(/\s+/g, '-')}.pdf`)
}
