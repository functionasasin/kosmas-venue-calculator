import type { Item } from '@/calculator/types'
import type { StoredLine } from '@/data/venueLines'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TableCell, TableRow } from '@/components/ui/table'

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
  return (
    <TableRow title={formula}>
      <TableCell>
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
      <TableCell className="text-right">
        {line.qty === 'TBD' ? (
          <span title="Not derivable — specify manually">TBD</span>
        ) : (
          <Input
            type="number" min="0" value={line.qty}
            className="text-right tabular-nums"
            title={formula}
            onChange={e => onUpdate({ qty: Number(e.target.value) })}
          />
        )}
      </TableCell>
      <TableCell className="text-right">
        <Button size="sm" variant="ghost" onClick={onRemove}>Remove</Button>
      </TableCell>
    </TableRow>
  )
}
