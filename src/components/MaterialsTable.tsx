import type { Item } from '@/calculator/types'
import type { StoredLine } from '@/data/venueLines'
import {
  groupIntoSections, itemsById, itemsByRole, resolveLineItem, sectionForItem,
} from '@/lib/sections'
import { Button } from '@/components/ui/button'
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
}

export function MaterialsTable({
  lines, catalog, formulas, onChange, isAdmin, chosen,
}: Props) {
  // The venue's resolved choice decides which of several active items a role
  // resolves to. The catalog itself is NOT collapsed — the swap control must
  // still be able to offer the alternate.
  const byRole = itemsByRole(catalog, chosen)
  const byId = itemsById(catalog)

  // UI visibility only. The anon key ships in the bundle and the venue_lines
  // RLS policy grants read to any authenticated user, so this is the same kind
  // of gate as hiding the Catalog button — not a boundary. The requirement is
  // that a length commitment does not appear in front of a client.
  const isCabling = (item: Item | undefined) =>
    item !== undefined && sectionForItem(item) === 'cabling'

  const hidden = (line: StoredLine) =>
    !isAdmin && isCabling(line.roleKey ? byRole.get(line.roleKey) : undefined)

  const addable = catalog.filter(
    i => i.isActive && i.roleKey && (isAdmin || !isCabling(i)),
  )
  const removed = lines.filter(l => l.suppressed && !hidden(l))

  // Sections are built from visible lines only, but every handler below maps
  // over the FULL `lines` array it was given. save_venue deletes every row for
  // the venue and re-inserts what it receives, in one transaction, so a
  // filtered array reaching onChange would delete the omitted rows from the
  // database.
  const sections = groupIntoSections(
    lines.filter(l => !l.suppressed && !hidden(l)), catalog, chosen,
  )

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

  // originRoleKey records the role this line vacated. It is set once — a
  // second swap must not overwrite the original, or recalculation re-adds it —
  // and it is NOT set at all when the swap stays inside the role, which is the
  // two-cameras case: nothing was vacated, and stamping it would make
  // mergeRecalculation treat the role as present twice.
  //
  // Keyed on item id, not role key: with several active items on one role a
  // role-keyed lookup is last-wins and lands on the wrong SKU.
  const swap = (line: StoredLine, itemId: string) => {
    const target = byId.get(itemId)
    if (!target) return
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
            <TableHead className="h-7 pl-4 text-[10px] font-medium uppercase tracking-[.04em] text-muted-foreground">
              Item / Model
            </TableHead>
            <TableHead className="hidden h-7 text-[10px] font-medium uppercase tracking-[.04em] text-muted-foreground lg:table-cell lg:w-[26%]">
              Formula
            </TableHead>
            <TableHead className="h-7 w-[110px] pr-4 text-right text-[10px] font-medium uppercase tracking-[.04em] text-muted-foreground lg:pr-2">
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
              byRole={byRole}
              byId={byId}
              catalog={catalog}
              formulas={formulas}
              isAdmin={isAdmin}
              chosen={chosen}
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
