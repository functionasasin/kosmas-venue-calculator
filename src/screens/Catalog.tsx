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
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Catalog</h1>
        <div className="flex gap-2">
          {/* Base UI buttons compose via `render`, not Radix's `asChild`. */}
          <Button variant="outline" render={<Link to="/" />}>Venues</Button>
          <Button onClick={() => setEditing('new')}>Add item</Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Role key</TableHead>
            <TableHead className="text-right">PoE W</TableHead>
            <TableHead className="text-right">Rack U</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map(item => (
            <TableRow key={item.id} className={item.isActive ? '' : 'opacity-50'}>
              <TableCell className="font-medium">
                {item.name}
                {!item.isActive && <Badge variant="outline" className="ml-2">inactive</Badge>}
              </TableCell>
              <TableCell>{item.category}</TableCell>
              <TableCell className="font-mono text-xs">{item.roleKey ?? '—'}</TableCell>
              <TableCell className="text-right tabular-nums">{item.poeWatts ?? '—'}</TableCell>
              <TableCell className="text-right tabular-nums">{item.rackU ?? '—'}</TableCell>
              <TableCell className="space-x-2 text-right">
                <Button size="sm" variant="ghost" onClick={() => setEditing(item)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => toggle(item)}>
                  {item.isActive ? 'Deactivate' : 'Reactivate'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

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
