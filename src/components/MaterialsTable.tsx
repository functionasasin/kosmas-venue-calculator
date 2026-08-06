import type { Item } from '@/calculator/types'
import type { StoredLine } from '@/data/venueLines'
import { groupIntoSections, itemsByRole } from '@/lib/sections'
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
}

export function MaterialsTable({ lines, catalog, formulas, onChange }: Props) {
  const byRole = itemsByRole(catalog)
  const addable = catalog.filter(i => i.isActive && i.roleKey)
  const removed = lines.filter(l => l.suppressed)

  // Sections are built from visible lines only, but every handler below maps
  // over the FULL `lines` array it was given. saveLines deletes every row for
  // the venue and re-inserts what it receives, so a filtered array reaching
  // onChange would delete the omitted rows from the database.
  const sections = groupIntoSections(lines.filter(l => !l.suppressed), catalog)

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
  // second swap must not overwrite the original, or recalculation re-adds it.
  // itemId moves with roleKey: exportMaterials resolves by itemId first, so a
  // stale one prints the item the user swapped away from.
  const swap = (line: StoredLine, roleKey: string) => {
    const target = byRole.get(roleKey)
    onChange(lines.map(l =>
      l.id === line.id
        ? {
            ...l,
            roleKey: roleKey as StoredLine['roleKey'],
            itemId: target?.id ?? l.itemId,
            originRoleKey: l.originRoleKey ?? l.roleKey,
            source: 'manual' as const,
          }
        : l))
  }

  const add = (roleKey: string) => {
    const item = byRole.get(roleKey)
    if (!item) return
    onChange([...lines, {
      id: `new-manual:${roleKey}:${Date.now()}`,
      venueId: '',
      itemId: item.id,
      roleKey: roleKey as StoredLine['roleKey'],
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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item / Model</TableHead>
            <TableHead className="hidden lg:table-cell">Formula</TableHead>
            <TableHead className="w-32 text-right">Qty</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sections.map(section => (
            <MaterialsSection
              key={section.id}
              section={section}
              byRole={byRole}
              catalog={catalog}
              formulas={formulas}
              onUpdate={update}
              onSwap={swap}
              onRemove={remove}
            />
          ))}
        </TableBody>
      </Table>

      <div className="flex items-center gap-2">
        <label htmlFor="addLine" className="text-sm text-muted-foreground">
          Add line
        </label>
        <select
          id="addLine"
          className="rounded-md border bg-background p-2 text-sm"
          value=""
          onChange={e => { if (e.target.value) add(e.target.value) }}
        >
          <option value="">— choose an item —</option>
          {addable.map(i => (
            <option key={i.roleKey!} value={i.roleKey!}>{i.name}</option>
          ))}
        </select>
      </div>

      {removed.length > 0 && (
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>Removed lines (will not return on recalculation):</p>
          {removed.map(l => {
            const item = l.roleKey ? byRole.get(l.roleKey) : undefined
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
