import { useState } from 'react'
import type { StoredLine } from '@/data/venueLines'
import type { CatalogIndex, Section } from '@/lib/sections'
import { resolveLineItem, sectionForItem, swapOptionsFor } from '@/lib/sections'
import { TableCell, TableRow } from '@/components/ui/table'
import { MaterialsRow } from './MaterialsRow'

interface Props {
  section: Section
  /**
   * Built once by MaterialsTable — this component is rendered per section and
   * calls swapOptionsFor per row, which is why none of it is derived here.
   */
  index: CatalogIndex
  formulas: Map<string, string>
  isAdmin: boolean
  onUpdate: (id: string, patch: Partial<StoredLine>) => void
  onSwap: (line: StoredLine, itemId: string) => void
  onRemove: (line: StoredLine) => void
}

export function MaterialsSection({
  section, index, formulas, isAdmin, onUpdate, onSwap, onRemove,
}: Props) {
  // Sections start expanded. State is local and not persisted: a section that
  // empties across a recalculation unmounts and loses it, which is fine —
  // a section that disappears and returns is a different thing to the user.
  const [open, setOpen] = useState(true)

  // The only place in the UI that uses colour to mean something.
  const decide = section.id === 'decide'

  return (
    <>
      <TableRow data-testid="section-header" className="max-sm:block">
        <TableCell
          colSpan={4}
          data-testid={`section-header-${section.id}`}
          role="button"
          tabIndex={0}
          aria-expanded={open}
          className={`cursor-pointer py-1.5 pl-4 text-[11px] font-semibold uppercase tracking-[.03em] max-sm:block ${decide ? 'bg-decide text-attention-foreground hover:bg-decide-hover' : 'bg-muted text-brand hover:bg-accent'}`}
          onClick={() => setOpen(o => !o)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setOpen(o => !o)
            }
          }}
        >
          {open ? '▾' : '▸'} {section.label} · {section.lines.length}
          {decide && (
            // This caption, not the label, is what fixes how dark --decide-hover
            // may go: --muted-foreground is the dimmer of the two texts on the
            // band and reads 4.55:1 there, against the label's 4.70:1.
            <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground">
              resolve before ordering
            </span>
          )}
        </TableCell>
      </TableRow>

      {open && section.lines.map(line => (
        <MaterialsRow
          key={line.id}
          line={line}
          item={resolveLineItem(line, index.byId, index.byRole)}
          formula={formulas.get(line.roleKey ?? '') ?? ''}
          // swapOptionsFor returns the whole active catalog when a line's item
          // doesn't resolve (an unrepairable line has to be repairable), which
          // for a non-admin would otherwise print cable item names into the
          // swap picker on a line that isn't even hidden. Filtering belongs
          // here, not in sections.ts — that function's behaviour is correct.
          swapOptions={swapOptionsFor(line, index).filter(
            i => isAdmin || sectionForItem(i) !== 'cabling',
          )}
          onUpdate={patch => onUpdate(line.id, patch)}
          onSwap={itemId => onSwap(line, itemId)}
          onRemove={() => onRemove(line)}
        />
      ))}
    </>
  )
}
