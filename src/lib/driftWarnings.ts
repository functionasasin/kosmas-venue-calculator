import type { Item, Warning } from '@/calculator/types'
import { ROLE_LABELS, type RoleKey } from '@/calculator/roleKeys'
import type { StoredLine } from '@/data/venueLines'
import { itemsById } from '@/lib/sections'

/**
 * What the venue is SIZED on, versus what its list actually NAMES.
 *
 * calculateBOM reads the inputs and the resolved catalog, never the stored
 * lines, so a hand-edited line cannot change the rung, the port count or the
 * PoE budget — it only changes what gets printed. mergeRecalculation leaves
 * manual lines alone, deliberately, so the two can drift apart with nothing on
 * screen saying so, and the printed sheet is where it would be found.
 *
 * Two ways they drift, and both are reported:
 *
 *   - the role's line still fills it but names a different item. The swap
 *     control writes the venue's choice for a same-role swap now, so the live
 *     way to reach this is gone; what remains is a line hand-swapped before
 *     that delegation existed, and a role holding a second line. An item that
 *     AGREES is not reported — a manual line freezes its quantity, which is
 *     not this warning's business.
 *
 *   - the line was swapped to another role's item entirely. It keeps its new
 *     roleKey and records the vacated one in originRoleKey (MaterialsTable's
 *     swap()), so a plain roleKey match misses it — and it is the worse of the
 *     two, because nothing on the list fills the role at all while the venue is
 *     still sized as though something does.
 *
 * `chosen`, NOT the venue's stored pin, is what "sized on" means. The choice
 * set deliberately carries the pin so a save cannot overwrite it, and the two
 * disagree in exactly the state this warning is most likely to be read in: a
 * pin whose item was deactivated sizes the venue on the fallback while the
 * stored id still names the dead item. Comparing against the pin there reports
 * a drift between two items the venue is not sized on either way, and stays
 * silent on the line that really has drifted. Taking ROLE KEYS rather than the
 * choice set is what makes that structural — the pinned ids are not in reach
 * here, so the comparison cannot regress to them.
 *
 * A role can hold more than one manual line — a hand-edited formula line plus
 * one added by hand — so the FIRST match is not good enough: it can agree while
 * a second line prints an item the venue is not sized on. The one that actually
 * drifted is the one worth naming.
 *
 * `catalog` is the WHOLE catalog, deactivated rows included: the item a drifted
 * line names is frequently one that has since been retired, and the reader
 * needs it named rather than called "its item".
 */
export function driftWarnings(
  roles: RoleKey[],
  lines: StoredLine[],
  catalog: Item[],
  chosen: Map<RoleKey, string>,
): Warning[] {
  const byId = itemsById(catalog)
  const warn = (message: string): Warning[] =>
    [{ code: 'CHOICE_OVERRIDDEN', level: 'warn' as const, message }]

  return roles.flatMap(roleKey => {
    const sizedId = chosen.get(roleKey)
    // The role resolved to nothing at all. ROLE_NO_DEFAULT already says so, and
    // there is no item to say the list disagrees with.
    if (!sizedId) return []

    const line = lines.find(
      l => (l.roleKey === roleKey || l.originRoleKey === roleKey)
        && l.source === 'manual' && !l.suppressed
        && (l.roleKey !== roleKey || l.itemId !== sizedId),
    )
    if (!line) return []
    const itemName = byId.get(line.itemId)?.name ?? 'its item'
    const roleLabel = ROLE_LABELS[roleKey].toLowerCase()

    if (line.roleKey === roleKey) {
      const sizedName = byId.get(sizedId)?.name ?? 'another item'
      return warn(
        `The ${roleLabel} line on this list was edited by hand and still ` +
        `names "${itemName}", but this venue is sized on "${sizedName}". ` +
        'Remove the line and recalculate to bring the two back in step.',
      )
    }

    // Naming the swap target's own role in parens when it has one: a line can
    // land on a roleless item (a cable, say — roleKey null is a real state, not
    // just the freshly-added case), and there is nothing to name there beyond
    // the item itself.
    return warn(
      `The ${roleLabel} line on this list was hand-swapped to ` +
      `"${itemName}"${line.roleKey ? ` (${ROLE_LABELS[line.roleKey].toLowerCase()})` : ''}, ` +
      `so nothing on this list fills ${roleLabel} any more — though the ` +
      'venue is still sized as if something does. Remove the line and ' +
      'recalculate to bring it back.',
    )
  })
}
