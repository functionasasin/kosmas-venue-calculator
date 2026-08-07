import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listItems, upsertItem, setItemActive } from '@/data/items'
import type { Item } from '@/calculator/types'
import { ItemForm } from '@/components/ItemForm'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'

export function Catalog() {
  const [items, setItems] = useState<Item[]>([])
  const [editing, setEditing] = useState<Item | 'new' | null>(null)

  const reload = () => listItems(true).then(setItems).catch(e => toast.error(e.message))
  useEffect(() => { reload() }, [])

  const save = async (item: Partial<Item> & { name: string }) => {
    try {
      await upsertItem(item)
      setEditing(null)
      reload()
      toast.success('Item saved')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const toggle = async (item: Item) => {
    // Reactivating an item whose role key was claimed meanwhile violates the
    // partial unique index. Postgres's raw text names the constraint, not the
    // conflicting item, so the conflict is resolved here and named.
    if (!item.isActive && item.roleKey) {
      const holder = items.find(
        i => i.isActive && i.roleKey === item.roleKey && i.id !== item.id,
      )
      if (holder) {
        toast.error(
          `"${holder.name}" already holds the role ${item.roleKey}. ` +
          'Deactivate it first.',
        )
        return
      }
    }
    try {
      await setItemActive(item.id, !item.isActive)
      reload()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <h1 className="text-2xl font-semibold">Catalog</h1>
          <div className="flex gap-1.5">
            {/* Base UI buttons compose via `render`, not Radix's `asChild`. */}
            <Button variant="outline" size="sm" className="h-auto px-[.55rem] py-[.25rem] text-[11px]"
              render={<Link to="/" />}>
              Venues
            </Button>
            <Button size="sm" className="h-auto px-[.55rem] py-[.25rem] text-[11px]"
              onClick={() => setEditing('new')}>
              Add item
            </Button>
          </div>
        </div>

        {/* overflow-x-auto lives in ui/table.tsx already; min-w forces the table
            past the viewport at phone widths so the cut-off Name column reads as
            "scroll me" instead of a rendering failure. The hint sits above the
            table so it is seen before the table itself, not after scrolling
            past every row. */}
        <div className="space-y-1 p-4">
          <p className="text-xs text-muted-foreground sm:hidden">← scroll for more →</p>
          <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead className="h-7 text-[10px] font-medium uppercase tracking-[.04em] text-muted-foreground">
                Name
              </TableHead>
              <TableHead className="h-7 text-[10px] font-medium uppercase tracking-[.04em] text-muted-foreground">
                Category
              </TableHead>
              <TableHead className="h-7 text-[10px] font-medium uppercase tracking-[.04em] text-muted-foreground">
                Role key
              </TableHead>
              <TableHead className="h-7 text-right text-[10px] font-medium uppercase tracking-[.04em] text-muted-foreground">
                PoE W
              </TableHead>
              <TableHead className="h-7 text-right text-[10px] font-medium uppercase tracking-[.04em] text-muted-foreground">
                Rack U
              </TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(item => (
              <TableRow key={item.id} className={item.isActive ? '' : 'opacity-50'}>
                <TableCell className="py-1.5 font-medium">
                  {item.name}
                  {!item.isActive && <Badge variant="outline" className="ml-2">inactive</Badge>}
                </TableCell>
                <TableCell className="py-1.5">{item.category}</TableCell>
                <TableCell className="py-1.5 font-mono text-xs">{item.roleKey ?? '—'}</TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">{item.poeWatts ?? '—'}</TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">{item.rackU ?? '—'}</TableCell>
                <TableCell className="space-x-2 py-1.5 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(item)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => toggle(item)}>
                    {item.isActive ? 'Deactivate' : 'Reactivate'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </div>

      <Dialog open={editing !== null} onOpenChange={o => !o && setEditing(null)}>
        {/* The form is taller than a laptop viewport; without this the Save
            button sits below the fold with nothing to scroll. */}
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? 'Add item' : 'Edit item'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <ItemForm
              item={editing === 'new' ? undefined : editing}
              onSave={save}
              onCancel={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
