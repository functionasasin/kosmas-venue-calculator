import type { Item } from '@/calculator/types'
import { ROLE_FAMILY, readRoleKey } from '@/calculator/roleKeys'
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
 * Constrained by the line's *item's* ROLE FAMILY, not by the section the line
 * currently renders in — a TBD line lives in `decide` but must still be
 * swappable for its real peers.
 *
 * The section was the constraint until 2026-08-25 and was far too coarse:
 * SECTION_FOR_CATEGORY above folds rack, compute, storage, power and network
 * into one `rack` band, so the UDM line offered patch panels, a Kisi
 * controller, three switches, five UPS rungs, four racks and an SSD — and the
 * replay camera line offered the Autonomous+ security camera, which is not a
 * substitute for it. ROLE_FAMILY groups only the genuine variants of one piece
 * of hardware; see its comment for how new hardware joins a family.
 *
 * Two cases keep the FULL list instead, and both are the same rule: a picker
 * that offers nothing makes "No active item mapped for …" permanent, and
 * swapping is exactly how that gets repaired.
 *
 *   - The line's item does not resolve at all, so there is no family to filter
 *     by.
 *   - The family resolves but has no ACTIVE member — every item on the role
 *     was deactivated. itemsByRole deliberately ignores isActive, so the role
 *     still names a retired item and the family is still known; it is just
 *     empty. Narrowing to it would replace one unrepairable row with another.
 */
export function swapOptionsFor(
  line: StoredLine, catalog: Item[], chosen?: Map<string, string>,
): Item[] {
  const active = catalog.filter(i => i.isActive && i.roleKey)
  const item = line.roleKey ? itemsByRole(catalog, chosen).get(line.roleKey) : undefined
  const target = familyOf(item)
  if (!target) return active
  const family = active.filter(i => familyOf(i) === target)
  return family.length > 0 ? family : active
}

/**
 * Null for an item with no role key, and for a role key the catalog holds but
 * ROLE_KEYS no longer does — `items.role_key` is plain text with no check
 * constraint, so a retired key (the junction boxes, the HDMI cable) still
 * comes back from the database. Both cases mean "no family", which routes to
 * the full-catalog fallback above rather than to an empty picker.
 */
function familyOf(item: Item | undefined): string | null {
  const role = readRoleKey(item?.roleKey)
  return role ? ROLE_FAMILY[role] : null
}
