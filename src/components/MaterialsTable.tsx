import type { Item } from '@/calculator/types'
import type { StoredLine } from '@/data/venueLines'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

interface Props {
  lines: StoredLine[]
  catalog: Item[]
  formulas: Map<string, string>
  onChange: (lines: StoredLine[]) => void
}

export function MaterialsTable({ lines, catalog, formulas, onChange }: Props) {
  const byRole = new Map(catalog.filter(i => i.roleKey).map(i => [i.roleKey!, i]))
  const addable = catalog.filter(i => i.isActive && i.roleKey)
  const visible = lines.filter(l => !l.suppressed)
  const removed = lines.filter(l => l.suppressed)

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
    const target = byRole.get(roleKey as never)
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
    const item = byRole.get(roleKey as never)
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
          <TableHead className="w-32 text-right">Qty</TableHead>
          <TableHead className="w-24" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {visible.map(line => {
          const item = line.roleKey ? byRole.get(line.roleKey) : undefined
          return (
            <TableRow key={line.id} title={formulas.get(line.roleKey ?? '') ?? ''}>
              <TableCell>
                <select
                  className="w-full bg-transparent text-sm"
                  value={line.roleKey ?? ''}
                  onChange={e => swap(line, e.target.value)}
                >
                  {addable.map(i => (
                    <option key={i.roleKey!} value={i.roleKey!}>{i.name}</option>
                  ))}
                  {item && !item.isActive && (
                    <option value={item.roleKey!}>{item.name} (inactive)</option>
                  )}
                </select>
                {!item && (
                  <span className="text-xs text-destructive">
                    No active item mapped for {line.roleKey}
                  </span>
                )}
                {line.source === 'manual' && (
                  <Badge variant="outline" className="ml-2 text-xs">edited</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                {line.qty === 'TBD' ? (
                  <span title="Not derivable — specify manually">TBD</span>
                ) : (
                  <Input
                    type="number" min="0" value={line.qty}
                    className="text-right tabular-nums"
                    title={formulas.get(line.roleKey ?? '') ?? ''}
                    onChange={e => update(line.id, { qty: Number(e.target.value) })}
                  />
                )}
              </TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="ghost" onClick={() => remove(line)}>
                  Remove
                </Button>
              </TableCell>
            </TableRow>
          )
        })}
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
