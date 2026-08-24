import type { Item } from '@/calculator/types'
import { ROLE_LABELS } from '@/calculator/roleKeys'
import type { StoredLine } from '@/data/venueLines'
import { itemsById } from '@/lib/sections'

/**
 * Comparison of two line sets, rendered for the Recalculate preview and the
 * staleness check. Shared by both so the two can never disagree about whether
 * anything would change.
 *
 * Extracted from VenueDetail.tsx on 2026-08-20 so it can be tested directly:
 * it now has three behaviours that a component test cannot pin precisely — the
 * item comparison, the null-role keying and the labels.
 *
 * Lines key on their ROLE, falling back to their item for the manual lines
 * that carry roleKey null. Keying on the role alone collapsed every manual
 * line into one Map entry that rendered `+ null: 3`.
 *
 * The scheme narrows collisions rather than eliminating them, and the residue
 * is worth knowing: a role key and an `item:` key cannot collide (role keys
 * are a closed set of 36 literals, none of which starts `item:`), but a
 * formula line and a hand-added line on the SAME role still share a key — and
 * MaterialsTable's `add` sets the item's role key, so adding the second camera
 * by hand produces exactly that pair. Two manual lines carrying the same
 * itemId, or two carrying none, also collapse. All three are pre-existing and
 * far narrower than the null collapse being fixed here.
 */
const keyOf = (line: StoredLine) => line.roleKey ?? `item:${line.itemId}`

export function diffLines(
  before: StoredLine[], after: StoredLine[], catalog: Item[],
): string[] {
  const byId = itemsById(catalog)

  // A role line is labelled by its ROLE, not by the item currently on it — the
  // item is what may be changing, and "Dahua: Uniview → Dahua" reads as a
  // riddle. A manual line has no role, so its item's name is the only name it
  // has.
  const label = (line: StoredLine) =>
    line.roleKey
      ? ROLE_LABELS[line.roleKey]
      : byId.get(line.itemId)?.name ?? 'Manual line'

  const nameOf = (line: StoredLine) =>
    byId.get(line.itemId)?.name ?? line.roleKey ?? 'no item'

  const prev = new Map(before.map(l => [keyOf(l), l]))
  const next = new Map(after.map(l => [keyOf(l), l]))
  const rows: string[] = []

  for (const [key, l] of next) {
    const was = prev.get(key)
    if (!was) { rows.push(`+ ${label(l)}: ${l.qty}`); continue }
    if (was.qty !== l.qty) {
      rows.push(`~ ${label(l)}: ${was.qty} → ${l.qty}`)
    }
    // Reported separately from the quantity, and only when the quantity held:
    // a line that changed both is already flagged, and two rows for one line
    // reads as two changes.
    else if (was.itemId !== l.itemId) {
      rows.push(`~ ${label(l)}: ${nameOf(was)} → ${nameOf(l)}`)
    }
  }

  for (const [key, l] of prev) {
    if (!next.has(key)) rows.push(`− ${label(l)}: removed`)
  }

  return rows
}
