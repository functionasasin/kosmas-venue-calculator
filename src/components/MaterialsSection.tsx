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
  chosen?: Map<string, string>
  onUpdate: (id: string, patch: Partial<StoredLine>) => void
  onSwap: (line: StoredLine, itemId: string) => void
  onRemove: (line: StoredLine) => void
}

export function MaterialsSection({
  section, byRole, catalog, formulas, isAdmin, chosen, onUpdate, onSwap, onRemove,
}: Props) {
  // itemId first, byRole as the fallback — the same order exportMaterials
  // uses. With several items on one role, byRole holds the resolved one, which
  // is right for a formula line and WRONG for a line the user swapped by hand.
  // Resolving by id is what keeps the screen and the PDF naming the same item.
  const byId = new Map(catalog.map(i => [i.id, i]))

  /**
   * An EMPTY itemId is mergeRecalculation saying the role resolved to nothing,
   * and it has no item — the row renders "No active item mapped for …" and
   * saveVenueAndLines refuses it. The role fallback below must not run for it:
   * byRole is built from the whole catalog with no active filter, and `chosen`
   * holds no entry for a role with no active winner, so it would name a
   * DEACTIVATED candidate — whichever came first of however many. That is the
   * arbitrary resolution resolveCatalog exists to prevent, and it put a SKU
   * nobody chose on a line the engine sized at zero watts. buildPdfBody drops
   * these lines on the same test, which is why the sheet was already right
   * while the screen was not.
   */
  const itemFor = (line: StoredLine) =>
    line.itemId
      ? byId.get(line.itemId) ?? (line.roleKey ? byRole.get(line.roleKey) : undefined)
      : undefined
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
          item={itemFor(line)}
          formula={formulas.get(line.roleKey ?? '') ?? ''}
          // swapOptionsFor returns the whole active catalog when a line's item
          // doesn't resolve (an unrepairable line has to be repairable), which
          // for a non-admin would otherwise print cable item names into the
          // swap picker on a line that isn't even hidden. Filtering belongs
          // here, not in sections.ts — that function's behaviour is correct.
          swapOptions={swapOptionsFor(line, catalog, chosen).filter(
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
