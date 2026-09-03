import { useEffect, useState } from 'react'
import { listItems, upsertItem, setItemActive, setItemDefault } from '@/data/items'
import type { Item } from '@/calculator/types'
import { ItemForm } from '@/components/ItemForm'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BackToVenues } from '@/components/BackToVenues'
import { BrandBlock } from '@/components/BrandBlock'
import { toast } from 'sonner'

/**
 * How this item is powered and how much it draws. Both numbers feed one sum in
 * calculateBOM — the UPS is sized on poeWatts + mainsWatts — but they are not
 * interchangeable to a reader: 65 W off a wall socket and 65 W off a switch
 * port are different purchases.
 *
 * The unit rides in the cell rather than the header, unlike POE W and RACK U
 * beside it. One column carries two quantities here, so the row has to say
 * which one it is holding anyway — and having said "mains", saying "W" costs
 * two characters and stops the number being unitless.
 */
const powerLabel = (item: Item) => {
  const parts = []
  if (item.poeWatts !== null) parts.push(`${item.poeWatts} W PoE`)
  if (item.mainsWatts !== null) parts.push(`${item.mainsWatts} W mains`)
  return parts.length > 0 ? parts.join(' + ') : '—'
}

export function Catalog() {
  const [items, setItems] = useState<Item[]>([])
  const [editing, setEditing] = useState<Item | 'new' | null>(null)

  const reload = () =>
    listItems(true, true).then(setItems).catch(e => toast.error(e.message))
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

  // The guard that used to live here refused to reactivate an item whose role
  // key was held by another active item, because items_role_key_active would
  // have rejected the write with raw constraint text naming the constraint
  // rather than the conflicting item.
  //
  // That index is gone (0011). Several active items per role is the supported
  // state now — it is the whole point of venue_item_choices — and the
  // uniqueness that remains is on the DEFAULT flag, which activation never
  // sets. There is nothing left to pre-empt.
  const toggle = async (item: Item) => {
    try {
      await setItemActive(item.id, !item.isActive)
      reload()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  // One RPC. Clearing the incumbent and setting the new default as two writes
  // leaves the role with no default in between, and the other order is
  // rejected by items_role_key_default, which is not deferrable.
  const makeDefault = async (item: Item) => {
    try {
      await setItemDefault(item.id)
      reload()
      toast.success(`${item.name} is now the default for ${item.roleKey}`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    // Same shell as the venue page and Venues: full-bleed white surface, sticky
    // bar, table gutter on the cells. `← Venues` is the back link rather than a
    // button, matching the venue page's rail head.
    <div className="flex min-h-svh flex-col bg-card">
      {/* Same band as Venues, same reasoning — see BrandBlock. It scrolls away
          while the bar and the back row below stay pinned, so the sticky
          offsets under it are unchanged. */}
      <BrandBlock />
      <div className="sticky top-0 z-10 flex h-13 shrink-0 flex-wrap items-center
                      justify-between gap-3 border-b bg-card px-4">
        {/* Title alone, flush at the gutter — the same bar Venues has. The way
            back is the row below, not a link crammed in beside this. */}
        <h1 className="text-lg font-semibold tracking-tight">Catalog</h1>
        <div className="flex gap-1.5">
          <ThemeToggle />
          <Button size="toolbar"
            onClick={() => setEditing('new')}>
            Add item
          </Button>
        </div>
      </div>

      {/* top-13 is the h-13 bar above it: the venue page's copy rides a sticky
          aside, so letting this one scroll away would give one component two
          behaviours — on the screen with the longest table. */}
      <BackToVenues className="sticky top-13 z-10" />

      {/* overflow-x-auto lives in ui/table.tsx already; min-w forces the table
          past the viewport at phone widths so the cut-off Name column reads as
          "scroll me" instead of a rendering failure.

          That cue used to be a `← scroll for more →` line above the table. It
          worked, but it cost 20px of a phone's vertical budget on the screen
          that could least afford it — chrome above the first row was 224px of
          800px. It is now a right-edge fade, which says the same thing in 0px
          of height, plus an sr-only line so the information is not lost to a
          screen reader.

          The fade sits on a wrapper OUTSIDE the table, not inside it: the
          container in ui/table.tsx is the scroller, so an absolutely-positioned
          child of it would scroll away with the content instead of staying
          pinned to the right edge. */}
      <div className="min-w-0 flex-1 py-2 sm:py-4">
        <p className="sr-only">This table scrolls horizontally.</p>
        <div className="relative">
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
                Power
              </TableHead>
              <TableHead className="h-7 text-right text-[10px] font-medium uppercase tracking-[.04em] text-muted-foreground">
                Rack U
              </TableHead>
              <TableHead className="w-72 pr-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(item => (
              <TableRow key={item.id}
                className={`group/row hover:bg-muted/30 ${item.isActive ? '' : 'opacity-50'}`}>
                <TableCell className="py-1.5 pl-4 font-medium group-hover/row:shadow-[inset_2px_0_0_var(--brand)]">
                  {item.name}
                  {!item.isActive && <Badge variant="outline" className="ml-2">inactive</Badge>}
                  {item.isDefault && <Badge variant="outline" className="ml-2">default</Badge>}
                </TableCell>
                <TableCell className="py-1.5">{item.category}</TableCell>
                <TableCell className="py-1.5 font-mono text-xs">{item.roleKey ?? '—'}</TableCell>
                {/* One column, not two: mains draw had no column at all, and
                    no powered item in this catalog draws both ways, so a
                    second numeric column would be empty on nearly every row of
                    a table that already scrolls sideways. Which kind of draw
                    it is has to be on the row — 65 and 2.8 are the same column
                    but not the same quantity. */}
                <TableCell className="py-1.5 text-right tabular-nums whitespace-nowrap">
                  {powerLabel(item)}
                </TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">{item.rackU ?? '—'}</TableCell>
                <TableCell className="space-x-2 py-1.5 pr-4 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(item)}>Edit</Button>
                  {/* Only for an active, role-keyed item that is not already
                      the default. A deactivated row cannot hold one — the 0011
                      trigger clears the flag — so offering it would promise
                      something the database immediately undoes. */}
                  {item.isActive && item.roleKey && !item.isDefault && (
                    <Button size="sm" variant="ghost" onClick={() => makeDefault(item)}>
                      Make default
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => toggle(item)}>
                    {item.isActive ? 'Deactivate' : 'Reactivate'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {/* Phone only — from sm up the table fits and there is nothing to cue. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-12
                     bg-gradient-to-l from-card to-transparent sm:hidden"
        />
        </div>
      </div>

      <Dialog open={editing !== null} onOpenChange={o => !o && setEditing(null)}>
        {/* The form is taller than a laptop viewport; without this the Save
            button sits below the fold with nothing to scroll. */}
        <DialogContent>
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
