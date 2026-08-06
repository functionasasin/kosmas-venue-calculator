import type { Item } from '@/calculator/types'
import type { StoredLine } from '@/data/venueLines'

export type SectionId = 'rack' | 'court' | 'cabling' | 'decide'

export interface Section {
  id: SectionId
  label: string
  lines: StoredLine[]
}

/**
 * Section membership is derived from the category already on every catalog
 * item, so adding an item needs no code change. Lives in src/lib rather than
 * src/calculator because grouping is presentation — src/calculator is the
 * transcription of podplay-ph-venue-sizing.md and cites it section by section.
 */
const SECTION_FOR_CATEGORY: Record<string, SectionId> = {
  rack: 'rack', compute: 'rack', storage: 'rack', power: 'rack', network: 'rack',
  court: 'court', camera: 'court', accessory: 'court', signage: 'court',
  cable: 'cabling',
}

const SECTION_ORDER: SectionId[] = ['rack', 'court', 'cabling', 'decide']

export const SECTION_LABELS: Record<SectionId, string> = {
  rack: 'Rack',
  court: 'Court-side',
  cabling: 'Cabling',
  decide: 'Needs a decision',
}

/**
 * An unrecognised category lands in `decide`. `Item.category` is free text on
 * the item form and defaults to 'uncategorised', so without this fallback one
 * typo would drop an item's lines from the screen and the PDF alike.
 */
export function sectionForItem(item: Item): SectionId {
  return SECTION_FOR_CATEGORY[item.category] ?? 'decide'
}

/**
 * Resolves the line's item by role key, matching MaterialsTable. exportMaterials
 * resolves by itemId first, which agrees only because `swap` keeps itemId in
 * step — see MaterialsRow. If those diverge, a swapped line sits in one section
 * on screen and another on paper.
 */
export function sectionForLine(
  line: StoredLine, byRole: Map<string, Item>,
): SectionId {
  if (line.qty === 'TBD') return 'decide'
  const item = line.roleKey ? byRole.get(line.roleKey) : undefined
  if (!item) return 'decide'
  return sectionForItem(item)
}

export function itemsByRole(catalog: Item[]): Map<string, Item> {
  return new Map(catalog.filter(i => i.roleKey).map(i => [i.roleKey as string, i]))
}

/**
 * Caller filters suppressed lines out first — section counts are of visible
 * lines only. Array order is preserved inside each section: that is the
 * engine's emission order, and it is what MaterialsTable already renders.
 * Do not sort by sortOrder; mergeRecalculation mints every line with 0.
 */
export function groupIntoSections(lines: StoredLine[], catalog: Item[]): Section[] {
  const byRole = itemsByRole(catalog)
  const buckets = new Map<SectionId, StoredLine[]>()

  for (const line of lines) {
    const id = sectionForLine(line, byRole)
    const bucket = buckets.get(id)
    if (bucket) bucket.push(line)
    else buckets.set(id, [line])
  }

  return SECTION_ORDER
    .filter(id => (buckets.get(id)?.length ?? 0) > 0)
    .map(id => ({ id, label: SECTION_LABELS[id], lines: buckets.get(id)! }))
}

/**
 * Constrained by the line's *item's* category, not by the section the line
 * currently renders in — a TBD line lives in `decide` but must still be
 * swappable for its real peers.
 *
 * A line whose item does not resolve is the exception: it has no category, so a
 * same-section filter would offer it nothing — and swapping is exactly how the
 * "No active item mapped for …" case gets repaired. It keeps the full list.
 */
export function swapOptionsFor(line: StoredLine, catalog: Item[]): Item[] {
  const active = catalog.filter(i => i.isActive && i.roleKey)
  const item = line.roleKey ? itemsByRole(catalog).get(line.roleKey) : undefined
  if (!item) return active
  const target = sectionForItem(item)
  return active.filter(i => sectionForItem(i) === target)
}
