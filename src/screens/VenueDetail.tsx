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
import { tierLabel } from '@/lib/tierLabel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useRole } from '@/auth/useRole'
import { toast } from 'sonner'

/**
 * Role-keyed comparison of two line sets, rendered for the diff dialog. Shared
 * by the Recalculate preview and the staleness check so the two can never
 * disagree about whether anything would change.
 */
function diffLines(before: StoredLine[], after: StoredLine[]): string[] {
  const prev = new Map(before.map(l => [l.roleKey, l]))
  const next = new Map(after.map(l => [l.roleKey, l]))
  const rows: string[] = []
  for (const [role, l] of next) {
    const was = prev.get(role)
    if (!was) rows.push(`+ ${role}: ${l.qty}`)
    else if (was.qty !== l.qty) rows.push(`~ ${role}: ${was.qty} → ${l.qty}`)
  }
  for (const [role] of prev) {
    if (!next.has(role)) rows.push(`− ${role}: removed`)
  }
  return rows
}

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

  const diff = pending ? diffLines(lines, pending) : []

  // The table is a snapshot from the last recalculation; the checks and the
  // exported sheet's tier read the inputs live. Between an input edit and a
  // recalculation those disagree — a venue can print "Tier: Pro+" over a line
  // list still naming the Pro gateway. This is what detects that gap, using
  // the same merge the Recalculate dialog previews.
  const staleRows = useMemo(
    () => (result ? diffLines(lines, mergeRecalculation(lines, result.lines)) : []),
    [result, lines],
  )
  const stale = staleRows.length > 0

  // Only an empty venue is populated automatically. Applying on every load
  // would resurrect lines the user suppressed.
  useEffect(() => {
    if (result && lines.length === 0) {
      setLines(current => mergeRecalculation(current, result.lines))
    }
  }, [result, lines.length])

  const [staleExport, setStaleExport] = useState(false)

  const doExport = () => {
    if (!venue) return
    setStaleExport(false)
    exportMaterialsPdf(venue.name, tierLabel(venue), lines, catalogAll)
  }

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
    // Full-bleed: no page gutter and no card. The white surface is the window,
    // so the grey `--background` never shows on this screen — the only greys
    // left are the rail tint and the table's section bands, and those now mean
    // something instead of competing with a third one.
    <div className="flex min-h-svh flex-col bg-card lg:flex-row">
      {/* 232px, not 200: the warnings are full sentences and wrap to five or
          more lines each in a narrower rail. Below lg it stacks and the whole
          page scrolls; from lg it is a full-height surface pinned to the
          viewport, with only the inputs area scrolling, so that a venue with
          three checks still leaves Courts reachable at row 26. */}
      <aside className="w-full shrink-0 border-b bg-muted/50 lg:sticky lg:top-0 lg:flex
                        lg:h-svh lg:w-58 lg:flex-col lg:border-r lg:border-b-0">
        <div className="border-b px-4 py-3">
          <Link to="/"
            className="mb-1.5 inline-block text-[11px] text-muted-foreground transition-colors hover:text-foreground">
            ← Venues
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">{venue.name}</h1>
        </div>
        <div className="space-y-4 p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          <VenueInputsForm value={venue} onChange={onInputs} />
          {warnings.length > 0 && (
            <div className="border-t pt-4">
              <WarningsPanel warnings={warnings} />
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Sticky so Save stays reachable on a long BOM. Opaque, or rows show
            through it as they scroll under. */}
        <div className="sticky top-0 z-10 flex h-13 shrink-0 flex-wrap items-center
                        justify-end gap-1.5 border-b bg-card px-4">
          <Button variant="outline" size="sm" className="h-auto bg-card px-[.55rem] py-[.25rem] text-[11px]"
            onClick={recalculate}>
            Recalculate
            {/* The table is stale relative to the inputs. Marking the button is
                what stops the export warning being the first anyone hears of it. */}
            {stale && (
              <span aria-hidden className="ml-1 inline-block size-1.5 rounded-full bg-yellow-500" />
            )}
            {stale && <span className="sr-only">(inputs have changed)</span>}
          </Button>
          <Button variant="outline" size="sm" className="h-auto bg-card px-[.55rem] py-[.25rem] text-[11px]"
            onClick={() => (stale ? setStaleExport(true) : doExport())}>
            Export PDF
          </Button>
          <Button size="sm" className="h-auto px-[.55rem] py-[.25rem] text-[11px]" onClick={save}>
            Save
          </Button>
        </div>

        <div className="min-w-0 flex-1 py-4">
          <MaterialsTable lines={lines} catalog={catalogAll}
            formulas={formulas} onChange={setLines} isAdmin={role === 'admin'} />
        </div>
      </div>

      <Dialog open={staleExport} onOpenChange={setStaleExport}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Inputs changed since this list was calculated</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            The sheet would be headed <strong>{tierLabel(venue)}</strong> but its
            lines still reflect the previous inputs. Recalculating first keeps the
            two consistent.
          </p>
          <pre className="max-h-56 overflow-auto rounded-md bg-muted p-3 text-xs">
            {staleRows.join('\n')}
          </pre>
          <div className="flex gap-2">
            <Button onClick={() => { setStaleExport(false); recalculate() }}>
              Recalculate first
            </Button>
            <Button variant="outline" onClick={doExport}>Export anyway</Button>
          </div>
        </DialogContent>
      </Dialog>

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
