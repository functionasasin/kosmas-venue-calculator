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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

interface Props {
  line: StoredLine
  item: Item | undefined
  formula: string
  swapOptions: Item[]
  onUpdate: (patch: Partial<StoredLine>) => void
  onSwap: (itemId: string) => void
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
  const labelFor = (i: Item) => `${i.name}${i === inactiveFallback ? ' (inactive)' : ''}`

  // swapOptionsFor narrows to the line's role family, and about half the roles
  // on a stock Pro venue have exactly one active item in theirs — the Mac mini,
  // the iPad, the display, the Flic. A Select there opens a popup holding the
  // item already on screen, so the chevron advertises a choice that does not
  // exist; dropping it is what lets a chevron mean "there is a real
  // alternative here". Counted off `options`, not off swapOptions, so the
  // deactivated current item counts as the second: a retired SKU plus its live
  // replacement IS a choice and keeps its picker.
  //
  // A line that resolves to NO item keeps its picker whatever the count. The
  // row reads "No active item mapped for …" and the swap control is the only
  // thing that repairs it — swapOptionsFor hands that case the whole active
  // catalog for exactly this reason, and collapsing it to text because the
  // catalog happened to offer one candidate would make the error permanent.
  const choosable = options.length > 1 || !item

  // A native <select> was replaced here on 2026-08-17. It had two symptoms that
  // looked separate and were one element: no height class left it ~19px, under
  // the 24px tap-target floor, and `lg:w-auto` made it as wide as its *longest*
  // option — a native select's intrinsic width ignores which option is actually
  // selected — so a short item name left ~160px of dead space before the
  // chevron. No class fixes the second: the width is the control's own doing.
  // A button trigger sizes to the selected value and takes an explicit height,
  // so both go at once. The dialog picker below stays native on purpose — it is
  // the phone affordance, and there the OS picker wheel beats an in-page popup.
  //
  // Keyed on item id, NOT role key. A role can now hold several active items —
  // two replay cameras is the case this exists for — and keying on the role
  // rendered two options with the same value, so picking either one resolved
  // through a role map and landed on whichever came back last.
  const picker = !choosable ? (
    // h-7 and text-sm mirror SelectTrigger size="sm" so a row does not jog
    // vertically depending on whether its family has an alternative.
    <span data-slot="item-name" className="flex h-7 items-center truncate text-sm">
      {item ? labelFor(item) : (line.roleKey ?? '')}
    </span>
  ) : (
    <Select value={item?.id ?? ''} onValueChange={v => onSwap(v as string)}>
      <SelectTrigger
        size="sm"
        aria-label={swapLabel}
        className="max-w-full border-0 bg-transparent px-0 shadow-none hover:bg-muted/50"
      >
        <SelectValue>
          {(v: string) => {
            const sel = options.find(o => o.id === v)
            return sel ? labelFor(sel) : (line.roleKey ?? v)
          }}
        </SelectValue>
      </SelectTrigger>
      {/* The wrapper defaults the popup to w-(--anchor-width), which copies the
          trigger. That is right for a full-width trigger and wrong for one that
          hugs a short value: long item names get clipped and you cannot read
          what you are picking. Size to content, anchor width only as a floor,
          capped so it cannot run off a phone. */}
      <SelectContent className="w-auto min-w-(--anchor-width) max-w-[min(24rem,calc(100vw-2rem))]">
        {options.map(i => (
          <SelectItem key={i.id} value={i.id}>{labelFor(i)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
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
      className="h-6 px-1.5 text-sm font-semibold text-attention-foreground"
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
      <TableCell className="py-1 pl-4 group-hover/row:shadow-[inset_2px_0_0_var(--brand)] max-sm:block max-sm:w-full">
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

      <TableCell className="hidden truncate py-1 text-xs text-muted-foreground lg:table-cell lg:w-[26%]">
        {formula}
      </TableCell>

      {/* The one and only quantity control. Below sm this cell becomes the
          card's second line and carries the formula beside it. */}
      <TableCell
        className="w-[110px] py-1 pr-4 text-right lg:pr-2 max-sm:flex max-sm:w-full
                   max-sm:items-center max-sm:justify-between max-sm:gap-2"
      >
        <span className="hidden text-xs text-muted-foreground max-sm:inline">
          {formula}
        </span>
        <span className="max-sm:w-28">{qty}</span>
      </TableCell>

      <TableCell className="hidden py-1 text-right lg:table-cell lg:w-24 lg:pr-4">
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
              {/* Same rule as the inline picker, and it has to be applied in
                  both places: these two controls already diverged once (the
                  inline one grew an "(inactive)" option the dialog never got)
                  which is why they share one options array. */}
              {choosable ? (
                <select
                  className="w-full rounded-md border bg-card p-2 text-sm"
                  aria-label={swapLabel}
                  value={item?.id ?? ''}
                  onChange={e => onSwap(e.target.value)}
                >
                  {options.map(i => (
                    <option key={i.id} value={i.id}>
                      {labelFor(i)}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm">
                  {item ? labelFor(item) : (line.roleKey ?? '')}
                </p>
              )}
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
