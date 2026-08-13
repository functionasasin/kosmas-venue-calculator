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
    // Same shell as the venue page and Venues: full-bleed white surface, sticky
    // bar, table gutter on the cells. `← Venues` is the back link rather than a
    // button, matching the venue page's rail head.
    <div className="flex min-h-svh flex-col bg-card">
      <div className="sticky top-0 z-10 flex h-13 shrink-0 flex-wrap items-center
                      justify-between gap-3 border-b bg-card px-4">
        <div className="flex items-baseline gap-2.5">
          <Link to="/"
            className="text-[11px] text-muted-foreground transition-colors hover:text-foreground">
            ← Venues
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">Catalog</h1>
        </div>
        <Button size="sm" className="h-auto px-[.55rem] py-[.25rem] text-[11px]"
          onClick={() => setEditing('new')}>
          Add item
        </Button>
      </div>

      {/* overflow-x-auto lives in ui/table.tsx already; min-w forces the table
          past the viewport at phone widths so the cut-off Name column reads as
          "scroll me" instead of a rendering failure. The hint sits above the
          table so it is seen before the table itself, not after scrolling
          past every row. */}
      <div className="min-w-0 flex-1 space-y-1 py-4">
        <p className="px-4 text-xs text-muted-foreground sm:hidden">← scroll for more →</p>
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead className="h-7 pl-4 text-[10px] font-medium uppercase tracking-[.04em] text-muted-foreground">
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
              <TableHead className="w-52 pr-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(item => (
              <TableRow key={item.id}
                className={`group/row hover:bg-muted/30 ${item.isActive ? '' : 'opacity-50'}`}>
                <TableCell className="py-1.5 pl-4 font-medium group-hover/row:shadow-[inset_2px_0_0_var(--brand)]">
                  {item.name}
                  {!item.isActive && <Badge variant="outline" className="ml-2">inactive</Badge>}
                </TableCell>
                <TableCell className="py-1.5">{item.category}</TableCell>
                <TableCell className="py-1.5 font-mono text-xs">{item.roleKey ?? '—'}</TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">{item.poeWatts ?? '—'}</TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">{item.rackU ?? '—'}</TableCell>
                <TableCell className="space-x-2 py-1.5 pr-4 text-right">
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
