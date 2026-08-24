import type { Item, Warning } from '@/calculator/types'
import { ROLE_LABELS, type RoleKey } from '@/calculator/roleKeys'
import type { VenueItemChoice } from '@/data/venueItemChoices'

/**
 * The catalog can now hold several ACTIVE items on one role key. Eight
 * non-test sites assume it cannot — planUps, checkPoeBudget, sumRackU,
 * calculateBOM's POE_DATA_INCOMPLETE check, itemsByRole, itemIdFor and the
 * Catalog toggle — and they do not even fail the same way: `new Map` keeps the
 * LAST duplicate while `find` keeps the FIRST, so the UPS rung and the PoE
 * check would disagree about which item holds a role with nothing raised
 * anywhere.
 *
 * The invariant is not removed, it MOVES: the database relaxes, and this
 * function re-establishes one active item per role before any of those run.
 * If a later change makes the engine itself choice-aware, that guarantee is
 * gone and all eight sites become unsafe again.
 *
 * Item selection is not in podplay-ph-venue-sizing.md, which is why this lives
 * in src/lib and not in src/calculator.
 */

/** Active items per role key, for roles with more than one — i.e. real choices. */
export function multiOptionRoles(catalog: Item[]): Map<RoleKey, Item[]> {
  const byRole = new Map<RoleKey, Item[]>()
  for (const i of catalog) {
    if (!i.isActive || !i.roleKey) continue
    const held = byRole.get(i.roleKey)
    if (held) held.push(i)
    else byRole.set(i.roleKey, [i])
  }
  for (const [role, items] of byRole) {
    if (items.length < 2) byRole.delete(role)
    // Name order: the picker lists a role's alternates alphabetically, and
    // ordering or grouping them deliberately is out of scope.
    else items.sort((a, b) => a.name.localeCompare(b.name))
  }
  return byRole
}

/**
 * Collapses the catalog to one ACTIVE item per role key, using the venue's
 * choices, and reports what could not be resolved.
 *
 * Per role, in order:
 *   1. the venue's explicit choice — only if that item is still active AND
 *      still holds this role key. An item's role_key can be reassigned while
 *      it stays active, and a stale choice would otherwise inject it into a
 *      role it no longer fills.
 *   2. the role's is_default active item
 *   3. the sole active item, if there is exactly one
 *   4. otherwise the role resolves to nothing and is REPORTED, not dropped
 *      silently.
 *
 * Inactive items pass through untouched. VenueDetail holds two views of the
 * catalog — active-only for the formulas, all-items so a saved line still
 * renders a deactivated item's name — and itemsByRole filters on roleKey
 * alone, so a resolution that dropped inactives would blank those names.
 *
 * TWO OUTPUTS, and the difference is load-bearing:
 *
 *   `catalog` is COLLAPSED — a role's losing actives are gone. That is right
 *   for calculateBOM, mergeRecalculation and saveVenueAndLines, which must
 *   see exactly one item per role. Dropping the losers outright, rather than
 *   demoting them to isActive: false, is safe only because this array never
 *   reaches a display surface: MaterialsTable, exportMaterialsPdf and
 *   diffLines are all handed the untouched catalogAll, never this output, so
 *   nothing here has to keep a losing item's row around to resolve a NAME. A
 *   demoted-not-dropped row would instead cost something real — MaterialsRow
 *   appends " (inactive)" to any item flagged that way, so a losing active
 *   would print as inactive on a surface that did happen to see it, which is
 *   worse than simply not being there.
 *
 *   `chosen` is role -> winning item id, for the DISPLAY path, which keeps the
 *   whole catalog. MaterialsTable, swapOptionsFor and exportMaterialsPdf must
 *   still see both cameras: handing them the collapsed array would hide the
 *   alternate from the swap control entirely, and would misname any line whose
 *   itemId already points at it — printing the wrong camera on the sheet,
 *   which is the §5 failure this design exists to prevent.
 */
export function resolveCatalog(
  catalog: Item[],
  choices: VenueItemChoice[],
): { catalog: Item[]; chosen: Map<RoleKey, string>; warnings: Warning[] } {
  const wanted = new Map(choices.map(c => [c.roleKey, c.itemId]))
  const chosen = new Map<RoleKey, string>()
  const warnings: Warning[] = []
  const resolved: Item[] = []

  const byRole = new Map<RoleKey, Item[]>()
  for (const i of catalog) {
    // Everything that is not an active role-keyed item is carried through
    // as-is: it is not in competition for a role.
    if (!i.isActive || !i.roleKey) { resolved.push(i); continue }
    const held = byRole.get(i.roleKey)
    if (held) held.push(i)
    else byRole.set(i.roleKey, [i])
  }

  for (const [roleKey, actives] of byRole) {
    const label = ROLE_LABELS[roleKey]
    const wantedId = wanted.get(roleKey)
    const pick = wantedId ? actives.find(i => i.id === wantedId) : undefined

    const fallback =
      actives.find(i => i.isDefault) ??
      (actives.length === 1 ? actives[0] : undefined)

    // The venue's pick wins outright. Otherwise the role falls back, and the
    // fallback itself may be absent — that is ROLE_NO_DEFAULT below, not a
    // crash, because "no winner" is a state the role can legally be in.
    const winner = pick ?? fallback

    // Reported whether or not a substitute was found. Gating this on the
    // fallback would mean that when the venue's pick is dead AND the role has
    // no default, the only thing said is "set a default" — the venue's owner
    // would never learn their pick had vanished.
    if (!pick && wantedId) {
      // Named from the WHOLE catalog, not from `actives` — the item the venue
      // chose is by definition not among them any more, and "an item that is
      // no longer in the catalog" is what the reader gets when this resolution
      // was handed the active-only list. VenueDetail resolves catalogAll for
      // exactly this reason.
      const dead = catalog.find(i => i.id === wantedId)
      const named = dead
        ? `"${dead.name}"`
        : 'an item that is no longer in the catalog'
      warnings.push({
        code: 'CHOICE_UNAVAILABLE',
        level: 'warn',
        message: fallback
          ? `This venue's chosen ${label.toLowerCase()} (${named}) is ` +
            'deactivated or no longer fills that role, so the list has been ' +
            `sized with "${fallback.name}" instead. Pick one deliberately and save.`
          : `This venue's chosen ${label.toLowerCase()} (${named}) is ` +
            'deactivated or no longer fills that role, and there is nothing ' +
            'to fall back to. The choice is kept until you replace it.',
      })
    }

    if (winner) {
      chosen.set(roleKey, winner.id)
    } else {
      // No pick, no default, more than one candidate. Resolving arbitrarily
      // here is precisely the find/Map disagreement this function exists to
      // prevent, so the role holds nothing and calculateBOM's UNMAPPED_ROLE
      // says so too.
      warnings.push({
        code: 'ROLE_NO_DEFAULT',
        level: 'warn',
        message:
          `${label} has ${actives.length} active items and no catalog ` +
          'default, so nothing fills it. Set a default in the Catalog, or ' +
          'pick one for this venue.',
      })
    }

    // Only the winner is written back. A role's losers are gone from
    // `catalog`, not demoted — see the doc comment above for why that is
    // safe here and would not be on a display surface.
    if (winner) resolved.push(winner)
  }

  return { catalog: resolved, chosen, warnings }
}
