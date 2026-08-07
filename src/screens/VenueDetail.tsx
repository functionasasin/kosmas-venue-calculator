import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { calculateBOM } from '@/calculator'
import type { Item, VenueInputs } from '@/calculator/types'
import { getVenue, saveVenue, type Venue } from '@/data/venues'
import { listItems } from '@/data/items'
import { listLines, saveLines, mergeRecalculation, type StoredLine } from '@/data/venueLines'
import { VenueInputsForm } from '@/components/VenueInputsForm'
import { MaterialsTable } from '@/components/MaterialsTable'
import { WarningsPanel } from '@/components/WarningsPanel'
import { exportMaterialsPdf } from '@/pdf/exportMaterials'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useRole } from '@/auth/useRole'
import { toast } from 'sonner'

export function VenueDetail() {
  const { id } = useParams<{ id: string }>()
  const role = useRole()
  const [venue, setVenue] = useState<Venue | null>(null)
  // Two views of the catalog on purpose. `catalog` is active-only and drives
  // the formulas and the itemId resolution in saveLines — sizing must target
  // what can actually be bought, and the engine resolves a role with a plain
  // find(), so an inactive twin sharing a role key could shadow the real one.
  // `catalogAll` includes deactivated items so a saved line still renders its
  // item's name instead of silently vanishing from the table.
  const [catalog, setCatalog] = useState<Item[]>([])
  const [catalogAll, setCatalogAll] = useState<Item[]>([])
  const [lines, setLines] = useState<StoredLine[]>([])

  useEffect(() => {
    if (!id) return
    Promise.all([getVenue(id), listItems(), listItems(true), listLines(id)])
      .then(([v, c, all, l]) => {
        setVenue(v); setCatalog(c); setCatalogAll(all); setLines(l)
      })
      .catch(e => toast.error(e.message))
  }, [id])

  const [pending, setPending] = useState<StoredLine[] | null>(null)

  // Derived, not stored. The previous code set these from an effect that only
  // ran when lines were empty, so every saved venue loaded with no checks and
  // an empty formula map. Deriving makes that state unreachable, and the
  // checks now track the inputs as they are edited.
  const result = useMemo(
    () => (venue && catalog.length > 0 ? calculateBOM(venue, catalog) : null),
    [venue, catalog],
  )
  const warnings = result?.warnings ?? []
  const formulas = useMemo(
    () => new Map((result?.lines ?? []).map(l => [l.roleKey, l.formula])),
    [result],
  )

  /** Recompute and show what would change first — spec §7 requires the diff. */
  const recalculate = () => {
    if (!result) return
    setPending(mergeRecalculation(lines, result.lines))
  }

  const diff = (() => {
    if (!pending) return []
    const before = new Map(lines.map(l => [l.roleKey, l]))
    const after = new Map(pending.map(l => [l.roleKey, l]))
    const rows: string[] = []
    for (const [role, l] of after) {
      const prev = before.get(role)
      if (!prev) rows.push(`+ ${role}: ${l.qty}`)
      else if (prev.qty !== l.qty) rows.push(`~ ${role}: ${prev.qty} → ${l.qty}`)
    }
    for (const [role] of before) {
      if (!after.has(role)) rows.push(`− ${role}: removed`)
    }
    return rows
  })()

  // Only an empty venue is populated automatically. Applying on every load
  // would resurrect lines the user suppressed.
  useEffect(() => {
    if (result && lines.length === 0) {
      setLines(current => mergeRecalculation(current, result.lines))
    }
  }, [result, lines.length])

  const onInputs = (inputs: VenueInputs) =>
    setVenue(v => (v ? { ...v, ...inputs } : v))

  const save = async () => {
    if (!venue || !id) return
    try {
      await saveVenue(venue)
      await saveLines(id, lines, catalog)
      toast.success('Saved')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (!venue) return <div className="p-8">Loading…</div>

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{venue.name}</h1>
        <div className="flex flex-wrap gap-1.5">
          {/* Base UI composes via `render`, not Radix's `asChild`. */}
          <Button variant="outline" size="sm" className="h-auto px-[.55rem] py-[.25rem] text-[11px]"
            render={<Link to="/" />}>
            Venues
          </Button>
          <Button variant="outline" size="sm" className="h-auto px-[.55rem] py-[.25rem] text-[11px]"
            onClick={recalculate}>
            Recalculate
          </Button>
          <Button variant="outline" size="sm" className="h-auto px-[.55rem] py-[.25rem] text-[11px]"
            onClick={() => exportMaterialsPdf(venue.name, lines, catalogAll)}>
            Export PDF
          </Button>
          <Button size="sm" className="h-auto px-[.55rem] py-[.25rem] text-[11px]" onClick={save}>
            Save
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* 256px, not 200: the warnings are full sentences and wrap to five or
            more lines each in a narrower rail. It scrolls internally so that a
            venue with three checks still leaves Courts on screen at row 26 —
            which is the whole reason the rail is sticky. */}
        <div className="w-full space-y-4 lg:w-64 lg:shrink-0 lg:sticky lg:top-6
                        lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
          <VenueInputsForm value={venue} onChange={onInputs} />
          {warnings.length > 0 && (
            <div className="border-t pt-4">
              <WarningsPanel warnings={warnings} />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <MaterialsTable lines={lines} catalog={catalogAll}
            formulas={formulas} onChange={setLines} isAdmin={role === 'admin'} />
        </div>
      </div>

      <Dialog open={pending !== null} onOpenChange={o => !o && setPending(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Apply recalculation?</DialogTitle></DialogHeader>
          {diff.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing would change.</p>
          ) : (
            <pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs">
              {diff.join('\n')}
            </pre>
          )}
          <p className="text-xs text-muted-foreground">
            Lines you edited or added are left untouched, and lines you removed
            stay removed.
          </p>
          <div className="flex gap-2">
            <Button onClick={() => { setLines(pending!); setPending(null) }}>
              Apply
            </Button>
            <Button variant="outline" onClick={() => setPending(null)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
