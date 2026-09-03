import { useMemo } from 'react'
import type { Item } from '@/calculator/types'
import type { RoleKey } from '@/calculator/roleKeys'
import type { StoredLine } from '@/data/venueLines'
import {
  catalogIndex, groupIntoSections, resolveLineItem, sectionForItem,
} from '@/lib/sections'
import { multiOptionRoles } from '@/lib/resolveCatalog'
import { Button } from '@/components/ui/button'
import { cn, microLabel } from '@/lib/utils'
import {
  Table, TableBody, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { MaterialsSection } from './MaterialsSection'

interface Props {
  lines: StoredLine[]
  catalog: Item[]
  formulas: Map<string, string>
  onChange: (lines: StoredLine[]) => void
  isAdmin: boolean
  chosen?: Map<string, string>
  /**
   * Records which of a role's several active items this venue buys — the
   * venue_item_choices write. Until 2026-08-25 a second control in the rail
   * made this call and the swap below could not; see swap() for why the two
   * collapsed into one.
   */
  onPick: (roleKey: RoleKey, itemId: string) => void
}

export function MaterialsTable({
  lines, catalog, formulas, onChange, isAdmin, chosen, onPick,
}: Props) {
  // MEMOISED AS A GROUP, and this is the only component that re-derives them.
  // Every one of these walks the whole catalog, none of them depends on
  // anything but `catalog` and `chosen`, and this component re-renders on every
  // keystroke in the inputs rail because the venue's state lives above it.
  //
  // The venue's resolved choice decides which of several active items a role
  // resolves to. The catalog itself is NOT collapsed — the swap control must
  // still be able to offer the alternate.
  const index = useMemo(() => catalogIndex(catalog, chosen), [catalog, chosen])
  const { byRole, byId } = index
  // Roles with more than one ACTIVE item — the ones a venue can genuinely
  // choose between. See swap() for why a pin is written for these alone.
  const contested = useMemo(() => multiOptionRoles(catalog), [catalog])

  // UI visibility only — and now for a different reason than it was written
  // for. The old note justified this with "the venue_lines RLS policy grants
  // read to any authenticated user", which stopped meaning anything the moment
  // there stopped being a login.
  //
  // What is true now: every cable item ships in the listItems payload to
  // ANYONE, signed in or not. items_public (0017) carries every category on
  // purpose — excluding the cabling ones would look like it made this a real
  // boundary and would instead break the product, because cables.ts emits cable
  // lines for every venue, they would resolve to no item, and the unresolved
  // check would make every anonymous venue unsaveable.
  //
  // So this is not a boundary and never was. The requirement is narrower than
  // that and unchanged: a length commitment must not appear on screen or on the
  // sheet in front of a client. The printed half is safe on its own terms —
  // buildPdfBody drops cabling unconditionally for everyone
  // (exportMaterials.ts:102), not via isAdmin.
  const isCabling = (item: Item | undefined) =>
    item !== undefined && sectionForItem(item) === 'cabling'

  const hidden = (line: StoredLine) =>
    !isAdmin && isCabling(line.roleKey ? byRole.get(line.roleKey) : undefined)

  // index.active is exactly `isActive && roleKey`, already computed above.
  const addable = index.active.filter(i => isAdmin || !isCabling(i))
  const removed = lines.filter(l => l.suppressed && !hidden(l))

  // Sections are built from visible lines only, but every handler below maps
  // over the FULL `lines` array it was given. save_venue deletes every row for
  // the venue and re-inserts what it receives, in one transaction, so a
  // filtered array reaching onChange would delete the omitted rows from the
  // database.
  const sections = groupIntoSections(
    lines.filter(l => !l.suppressed && !hidden(l)), byRole,
  )

  // THE MEMOISATION STOPS AT THE CATALOG, deliberately, and the three lines
  // above are where it stops. They were memoised and reverted: `sections` and
  // `addable` are one pass over ~20 lines and ~37 items, against the ~60 whole
  // catalog walks per keystroke that `index` removed, so the win is not
  // measurable — and both close over `hidden`/`isCabling`, which are rebuilt
  // every render, so honest dependency arrays cost a useCallback each and
  // dishonest ones only trade this cost for a stale section list.
  //
  // Stable Section identities would matter if MaterialsSection were memoised.
  // It is not, and making it so is a larger change than it looks: every row
  // prop below is minted per render — the three handlers as inline closures,
  // swapOptions as a fresh filtered array — so React.memo would never hit
  // until all of them are stabilised too.

  const update = (id: string, patch: Partial<StoredLine>) =>
    onChange(lines.map(l => (l.id === id ? { ...l, ...patch, source: 'manual' } : l)))

  // A formula line is suppressed rather than deleted, so recalculation does
  // not resurrect it. A manual line has no formula counterpart, so it goes.
  const remove = (line: StoredLine) =>
    onChange(
      line.source === 'formula'
        ? lines.map(l => (l.id === line.id ? { ...l, suppressed: true } : l))
        : lines.filter(l => l.id !== line.id),
    )

  const restore = (line: StoredLine) =>
    onChange(lines.map(l => (l.id === line.id ? { ...l, suppressed: false } : l)))

  /**
   * Two different statements share one control, and which one a swap makes is
   * decided by whether it stays inside the line's own role.
   *
   * INSIDE the role, onto an active item: that is not an override at all, it
   * is the venue saying which of the role's active items it buys — exactly
   * what venue_item_choices records and what resolveCatalog feeds the engine.
   * Writing it as a manual line instead printed the new camera while the UPS
   * rung, the PoE budget and the port count all stayed sized for the old one,
   * with nothing on screen saying so. A separate picker in the rail used to be
   * the only way to say it; delegating here is what let that second control go.
   *
   * The target has to be ACTIVE. A choice pinned to a deactivated item is
   * CHOICE_UNAVAILABLE and resolveCatalog falls straight back to the default,
   * so swapping onto a retired SKU stays what it has always been — a manual
   * override, which is how a saved line survives its item's retirement. The
   * picker offers the active family plus the line's OWN item, so the only
   * inactive target it can hand this is the value already selected: the guard
   * is what stops re-picking a retired SKU pinning the venue to it.
   *
   * A pin is written only for a role that is actually CONTESTED — the same
   * test choicesToSave uses, so the two agree on what a choice even is. The
   * other way in here is a repair: a line whose own item was retired keeps
   * naming it, which is the second option that made the picker appear at all,
   * and picking the live replacement is not a choice between anything. Pinning
   * it anyway outlives the repair — choicesToSave persists every stored role
   * forever — so the day that replacement is itself retired, this venue alone
   * carries a dead pin, and with one active item left the row renders as plain
   * text and there is no control anywhere to clear it.
   *
   * itemId is re-pointed here rather than left to the next recalculation: the
   * row has to show what was just picked. `source` is deliberately untouched,
   * so a formula line stays one and the rows the choice moves underneath it —
   * the rung, the switch — surface as stale for the Recalculate dialog.
   *
   * ACROSS roles it is an override, and unchanged: originRoleKey records the
   * role the line vacated. It is set once — a second swap must not overwrite
   * the original, or recalculation re-adds it — and never when the role is
   * unchanged, which now reaches this branch only for an inactive target:
   * nothing was vacated, and stamping it would make mergeRecalculation treat
   * the role as present twice.
   *
   * Keyed on item id, not role key: with several active items on one role a
   * role-keyed lookup is last-wins and lands on the wrong SKU.
   */
  const swap = (line: StoredLine, itemId: string) => {
    const target = byId.get(itemId)
    if (!target) return

    if (target.isActive && target.roleKey && target.roleKey === line.roleKey) {
      if (contested.has(target.roleKey)) onPick(target.roleKey, target.id)
      onChange(lines.map(l => (l.id === line.id ? { ...l, itemId: target.id } : l)))
      return
    }

    onChange(lines.map(l =>
      l.id === line.id
        ? {
            ...l,
            roleKey: target.roleKey,
            itemId: target.id,
            originRoleKey:
              target.roleKey === l.roleKey
                ? l.originRoleKey
                : l.originRoleKey ?? l.roleKey,
            source: 'manual' as const,
          }
        : l))
  }

  const add = (itemId: string) => {
    const item = byId.get(itemId)
    if (!item) return
    onChange([...lines, {
      id: `new-manual:${item.id}:${Date.now()}`,
      venueId: '',
      itemId: item.id,
      roleKey: item.roleKey,
      qty: 1,
      originRoleKey: null,
      sortOrder: lines.length,
      source: 'manual',
      suppressed: false,
      note: null,
    }])
  }

  return (
    <div className="space-y-4">
      {/* The horizontal gutter lives on the first and last cells rather than on
          a container. That is what lets the section bands and the row rules
          bleed to the window edge while the text still lines up under the
          headers.

          table-fixed only from lg, where all four columns render. Under fixed
          layout a display:none column still claims an equal share of the
          unspecified width — and a width set on it does not register, because
          the cell has no box — so below lg the hidden Formula and Remove
          columns silently stole 527px of a 900px row and left it blank. Auto
          layout ignores them correctly. */}
      <Table className="table-auto lg:table-fixed">
        <TableHeader className="max-sm:hidden">
          <TableRow>
            <TableHead className={cn('h-7 pl-4', microLabel)}>
              Item / Model
            </TableHead>
            <TableHead className={cn('hidden h-7  lg:table-cell lg:w-[26%]', microLabel)}>
              Formula
            </TableHead>
            <TableHead className={cn('h-7 w-[110px] pr-4 text-right  lg:pr-2', microLabel)}>
              Qty
            </TableHead>
            <TableHead className="hidden h-7 lg:table-cell lg:w-24 lg:pr-4" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sections.map(section => (
            <MaterialsSection
              key={section.id}
              section={section}
              index={index}
              formulas={formulas}
              isAdmin={isAdmin}
              onUpdate={update}
              onSwap={swap}
              onRemove={remove}
            />
          ))}
        </TableBody>
      </Table>

      <div className="flex min-w-0 items-center gap-2 px-4">
        <label htmlFor="addLine" className="shrink-0 text-[11px] text-muted-foreground">
          Add line
        </label>
        <select
          id="addLine"
          className="min-w-0 flex-1 rounded-md border bg-card px-2 py-1 text-sm"
          value=""
          onChange={e => { if (e.target.value) add(e.target.value) }}
        >
          <option value="">— choose an item —</option>
          {addable.map(i => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
      </div>

      {removed.length > 0 && (
        <div className="space-y-1 px-4 text-sm text-muted-foreground">
          <p>Removed lines (will not return on recalculation):</p>
          {removed.map(l => {
            const item = resolveLineItem(l, byId, byRole)
            return (
              <div key={l.id} className="flex items-center gap-2">
                <span>{item?.name ?? l.roleKey}</span>
                <Button size="sm" variant="ghost" onClick={() => restore(l)}>
                  Restore
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
