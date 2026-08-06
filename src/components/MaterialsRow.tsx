import { useState } from 'react'
import type { Item } from '@/calculator/types'
import type { StoredLine } from '@/data/venueLines'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TableCell, TableRow } from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

interface Props {
  line: StoredLine
  item: Item | undefined
  formula: string
  swapOptions: Item[]
  onUpdate: (patch: Partial<StoredLine>) => void
  onSwap: (roleKey: string) => void
  onRemove: () => void
}

export function MaterialsRow({
  line, item, formula, swapOptions, onUpdate, onSwap, onRemove,
}: Props) {
  // A TBD is a real output where the sizing doc declines to give a number, so
  // it is shown as-is — but it has to be resolvable, or the Needs-a-decision
  // section can never be emptied. Clearing the field returns the line to TBD;
  // qty_tbd already round-trips that state through the database.
  const [resolving, setResolving] = useState(false)
  const editing = line.qty !== 'TBD' || resolving

  const onQty = (raw: string) => {
    if (raw === '') {
      setResolving(false)
      onUpdate({ qty: 'TBD' })
      return
    }
    onUpdate({ qty: Number(raw) })
  }

  const [actions, setActions] = useState(false)

  const picker = (
    <select
      className="w-full bg-transparent text-sm"
      value={line.roleKey ?? ''}
      onChange={e => onSwap(e.target.value)}
    >
      {swapOptions.map(i => (
        <option key={i.roleKey!} value={i.roleKey!}>{i.name}</option>
      ))}
      {item && !item.isActive && (
        <option value={item.roleKey!}>{item.name} (inactive)</option>
      )}
    </select>
  )

  const qty = editing ? (
    <Input
      type="number" min="0" autoFocus={resolving}
      value={line.qty === 'TBD' ? '' : line.qty}
      className="text-right tabular-nums"
      title={formula}
      onChange={e => onQty(e.target.value)}
    />
  ) : (
    <Button
      size="sm" variant="ghost"
      className="font-semibold text-yellow-700 dark:text-yellow-500"
      title="Not derivable — set it manually"
      onClick={() => setResolving(true)}
    >
      TBD
    </Button>
  )

  return (
    <TableRow
      title={formula}
      className="max-sm:flex max-sm:flex-col max-sm:gap-1 max-sm:p-2"
    >
      <TableCell className="max-sm:block max-sm:w-full">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">{picker}</div>
          {/* Replaces the Remove column below lg, matching spec §6's table.
              Present in the DOM at every width — CSS hides it, which is what
              lets the jsdom test click it. */}
          <Button
            size="sm" variant="ghost" aria-label="Row actions"
            className="lg:hidden" onClick={() => setActions(true)}
          >
            ⋯
          </Button>
        </div>
        {!item && (
          <span className="text-xs text-destructive">
            No active item mapped for {line.roleKey}
          </span>
        )}
        {line.source === 'manual' && (
          <Badge variant="outline" className="ml-2 text-xs">edited</Badge>
        )}
      </TableCell>

      <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
        {formula}
      </TableCell>

      {/* The one and only quantity control. Below sm this cell becomes the
          card's second line and carries the formula beside it. */}
      <TableCell
        className="text-right max-sm:flex max-sm:w-full max-sm:items-center
                   max-sm:justify-between max-sm:gap-2"
      >
        <span className="hidden text-xs text-muted-foreground max-sm:inline">
          {formula}
        </span>
        <span className="max-sm:w-28">{qty}</span>
      </TableCell>

      <TableCell className="hidden text-right lg:table-cell">
        <Button size="sm" variant="ghost" onClick={onRemove}>Remove</Button>
      </TableCell>

      <Dialog open={actions} onOpenChange={setActions}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{item?.name ?? line.roleKey}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-sm text-muted-foreground">Swap item</p>
              <select
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={line.roleKey ?? ''}
                onChange={e => onSwap(e.target.value)}
              >
                {swapOptions.map(i => (
                  <option key={i.roleKey!} value={i.roleKey!}>{i.name}</option>
                ))}
              </select>
            </div>
            <Button
              variant="outline"
              onClick={() => { setActions(false); onRemove() }}
            >
              Remove line
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </TableRow>
  )
}
