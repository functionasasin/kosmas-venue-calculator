import { useState } from 'react'
import type { Item } from '@/calculator/types'
import type { StoredLine } from '@/data/venueLines'
import type { Section } from '@/lib/sections'
import { sectionForItem, swapOptionsFor } from '@/lib/sections'
import { TableCell, TableRow } from '@/components/ui/table'
import { MaterialsRow } from './MaterialsRow'

interface Props {
  section: Section
  byRole: Map<string, Item>
  catalog: Item[]
  formulas: Map<string, string>
  isAdmin: boolean
  onUpdate: (id: string, patch: Partial<StoredLine>) => void
  onSwap: (line: StoredLine, roleKey: string) => void
  onRemove: (line: StoredLine) => void
}

export function MaterialsSection({
  section, byRole, catalog, formulas, isAdmin, onUpdate, onSwap, onRemove,
}: Props) {
  // Sections start expanded. State is local and not persisted: a section that
  // empties across a recalculation unmounts and loses it, which is fine —
  // a section that disappears and returns is a different thing to the user.
  const [open, setOpen] = useState(true)

  // The only place in the UI that uses colour to mean something.
  const decide = section.id === 'decide'

  return (
    <>
      <TableRow
        data-testid="section-header"
        className={`max-sm:block ${decide ? 'bg-yellow-500/10' : 'bg-muted'}`}
      >
        <TableCell
          colSpan={4}
          data-testid={`section-header-${section.id}`}
          className="cursor-pointer text-sm font-semibold max-sm:block"
          onClick={() => setOpen(o => !o)}
        >
          {open ? '▾' : '▸'} {section.label} · {section.lines.length}
          {decide && (
            <span className="ml-2 font-normal text-muted-foreground">
              resolve before ordering
            </span>
          )}
        </TableCell>
      </TableRow>

      {open && section.lines.map(line => (
        <MaterialsRow
          key={line.id}
          line={line}
          item={line.roleKey ? byRole.get(line.roleKey) : undefined}
          formula={formulas.get(line.roleKey ?? '') ?? ''}
          // swapOptionsFor returns the whole active catalog when a line's item
          // doesn't resolve (an unrepairable line has to be repairable), which
          // for a non-admin would otherwise print cable item names into the
          // swap picker on a line that isn't even hidden. Filtering belongs
          // here, not in sections.ts — that function's behaviour is correct.
          swapOptions={swapOptionsFor(line, catalog).filter(
            i => isAdmin || sectionForItem(i) !== 'cabling',
          )}
          onUpdate={patch => onUpdate(line.id, patch)}
          onSwap={roleKey => onSwap(line, roleKey)}
          onRemove={() => onRemove(line)}
        />
      ))}
    </>
  )
}
