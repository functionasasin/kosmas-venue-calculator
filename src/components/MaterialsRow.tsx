import { useEffect, useState } from 'react'
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

  // Committing on every keystroke pushed a new qty up on every change, which
  // re-parents the row into a different section mid-edit (TBD -> a digit
  // moves the line out of `decide`; a digit -> empty forced it to TBD) and
  // the input loses focus under the user's fingers. Typed text lives here,
  // uncommitted, until blur or Enter — the field can sit empty mid-edit
  // without the line's actual qty changing underneath it.
  const [text, setText] = useState(() => (line.qty === 'TBD' ? '' : String(line.qty)))
  useEffect(() => {
    setText(line.qty === 'TBD' ? '' : String(line.qty))
  }, [line.qty])

  const commitQty = () => {
    if (text === '') {
      // Empty-means-TBD is scoped to the resolve affordance (spec §4.4), not
      // to every line: only a line actually being resolved from TBD may
      // become TBD by being left empty. Any other line reverts untouched.
      if (resolving) {
        setResolving(false)
        // A blur with nothing typed (e.g. curiosity-clicked TBD, or Enter's
        // commit already landed) must not re-write a qty that hasn't
        // changed — see the qty-unchanged guard below for why.
        if (line.qty !== 'TBD') onUpdate({ qty: 'TBD' })
      } else {
        setText(line.qty === 'TBD' ? '' : String(line.qty))
      }
      return
    }
    // A blur that carries no real edit (tabbing through, or the blur that
    // follows an Enter which already committed) must be a no-op: onUpdate
    // unconditionally flips `source` to 'manual' in the caller, and manual
    // lines are exempt from recalculation — so an unchanged commit would
    // freeze a formula-derived quantity forever under a false "edited" flag.
    const next = Number(text)
    if (next !== line.qty) onUpdate({ qty: next })
    setResolving(false)
  }

  const onQtyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitQty()
    }
  }

  const [actions, setActions] = useState(false)

  // Built once and shared by both selects so they cannot drift: the inline
  // picker used to append an "(inactive)" fallback option that the dialog
  // picker below lg never got, so a row for a deactivated item opened to a
  // dialog select whose value matched nothing and displayed some other item
  // as current.
  const inactiveFallback = item && !item.isActive ? item : undefined
  const options = inactiveFallback ? [...swapOptions, inactiveFallback] : swapOptions
  const swapLabel = `Swap item for ${item?.name ?? line.roleKey ?? 'unmapped line'}`

  const picker = (
    <select
      className="w-full min-w-0 truncate bg-transparent text-sm lg:w-auto lg:max-w-full"
      aria-label={swapLabel}
      value={line.roleKey ?? ''}
      onChange={e => onSwap(e.target.value)}
    >
      {options.map(i => (
        <option key={i.roleKey!} value={i.roleKey!}>
          {i.name}{i === inactiveFallback ? ' (inactive)' : ''}
        </option>
      ))}
    </select>
  )

  const qty = editing ? (
    <Input
      type="number" min="0" autoFocus={resolving}
      value={text}
      className="h-6 w-14 px-1.5 py-0.5 text-right text-sm tabular-nums max-sm:w-24"
      title={formula}
      onChange={e => setText(e.target.value)}
      onBlur={commitQty}
      onKeyDown={onQtyKeyDown}
    />
  ) : (
    <Button
      size="sm" variant="ghost"
      className="h-6 px-1.5 text-sm font-semibold text-yellow-700 dark:text-yellow-500"
      title="Not derivable — set it manually"
      onClick={() => setResolving(true)}
    >
      TBD
    </Button>
  )

  return (
    // Full-row hover with a marker on the leading edge. At full-bleed width the
    // Qty pill can sit 1400px from the item name, and this is what lets the eye
    // follow one row across that gap — it replaces the max-width that used to
    // keep the two columns close.
    <TableRow
      title={formula}
      className="group/row hover:bg-muted/30 max-sm:flex max-sm:flex-col max-sm:gap-1 max-sm:p-2"
    >
      <TableCell className="py-1 pl-4 group-hover/row:shadow-[inset_2px_0_0_var(--foreground)] max-sm:block max-sm:w-full">
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

      <TableCell className="hidden w-[26%] truncate py-1 text-xs text-muted-foreground lg:table-cell">
        {formula}
      </TableCell>

      {/* The one and only quantity control. Below sm this cell becomes the
          card's second line and carries the formula beside it. */}
      <TableCell
        className="w-[110px] py-1 text-right max-sm:flex max-sm:w-full max-sm:items-center
                   max-sm:justify-between max-sm:gap-2"
      >
        <span className="hidden text-xs text-muted-foreground max-sm:inline">
          {formula}
        </span>
        <span className="max-sm:w-28">{qty}</span>
      </TableCell>

      <TableCell className="hidden w-24 py-1 pr-4 text-right lg:table-cell">
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
                aria-label={swapLabel}
                value={line.roleKey ?? ''}
                onChange={e => onSwap(e.target.value)}
              >
                {options.map(i => (
                  <option key={i.roleKey!} value={i.roleKey!}>
                    {i.name}{i === inactiveFallback ? ' (inactive)' : ''}
                  </option>
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
