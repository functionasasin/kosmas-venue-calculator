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

/** id -> item. The other half of itemsByRole, and needed just as often. */
export const itemsById = (catalog: Item[]): Map<string, Item> =>
  new Map(catalog.map(i => [i.id, i]))

/**
 * The item a line names. `itemId` is authoritative — it survives the item
 * being deactivated or its role being reassigned elsewhere — and the role
 * lookup is only the fallback for a freshly calculated line that has not been
 * saved yet.
 *
 * An EMPTY itemId is not a miss to fall back from: it is mergeRecalculation
 * saying the role resolved to NOTHING, and the fallback would then name a
 * deactivated candidate — whichever of however many `itemsByRole` happens to
 * hold, since it does not filter on isActive and `chosen` carries no entry for
 * a role with no active winner. That is the arbitrary resolution
 * resolveCatalog exists to prevent, and it put a SKU nobody chose on both the
 * screen and the printed sheet before this guard existed in one place.
 *
 * One function because the rule had been written three times — in
 * MaterialsSection, in buildPdfBody and in MaterialsTable's removed-lines
 * list — and the third copy had already drifted without the guard.
 */
export function resolveLineItem(
  line: Pick<StoredLine, 'itemId' | 'roleKey'>,
  byId: Map<string, Item>,
  byRole: Map<string, Item>,
): Item | undefined {
  if (!line.itemId) return undefined
  return byId.get(line.itemId)
    ?? (line.roleKey ? byRole.get(line.roleKey) : undefined)
}

/**
 * One item per role key, for rendering and sectioning.
 *
 * Filters on roleKey alone and NOT on isActive, deliberately: the callers pass
 * the ALL-ITEMS catalog so a saved line whose item was deactivated still
 * renders its name instead of vanishing.
 *
 * That, plus several active items per role, is why the preference order has to
 * be explicit — `new Map` keeps the last entry, so without it the answer is
 * scan order:
 *
 *   1. the venue's chosen item, when the caller supplies the map
 *   2. any active item
 *   3. whatever is left (a role whose only item is deactivated)
 *
 * `chosen` is optional because two callers legitimately have no venue in hand:
 * exportMaterials resolves by itemId first and only falls back to this, and
 * sections.test.ts drives it directly. Omitting it means "any active item
 * wins", which is correct for every single-option role — i.e. all of them
 * until a second item is activated.
 */
export function itemsByRole(
  catalog: Item[], chosen?: Map<string, string>,
): Map<string, Item> {
  const byRole = new Map<string, Item>()
  for (const i of catalog) {
    if (!i.roleKey) continue
    const held = byRole.get(i.roleKey)
    if (!held) { byRole.set(i.roleKey, i); continue }
    if (chosen?.get(i.roleKey) === i.id) { byRole.set(i.roleKey, i); continue }
    if (chosen?.get(i.roleKey) === held.id) continue
    if (!held.isActive && i.isActive) byRole.set(i.roleKey, i)
  }
  return byRole
}

/**
 * Caller filters suppressed lines out first — section counts are of visible
 * lines only. Array order is preserved inside each section: that is the
 * engine's emission order, and it is what MaterialsTable already renders.
 * Do not sort by sortOrder; mergeRecalculation mints every line with 0.
 */
export function groupIntoSections(
  lines: StoredLine[], catalog: Item[], chosen?: Map<string, string>,
): Section[] {
  const byRole = itemsByRole(catalog, chosen)
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
export function swapOptionsFor(
  line: StoredLine, catalog: Item[], chosen?: Map<string, string>,
): Item[] {
  const active = catalog.filter(i => i.isActive && i.roleKey)
  const item = line.roleKey ? itemsByRole(catalog, chosen).get(line.roleKey) : undefined
  if (!item) return active
  const target = sectionForItem(item)
  return active.filter(i => sectionForItem(i) === target)
}
