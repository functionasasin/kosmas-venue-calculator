import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { calculateBOM } from '@/calculator'
import type { Item, VenueInputs } from '@/calculator/types'
import { getVenue, type Venue } from '@/data/venues'
import { listItems } from '@/data/items'
import {
  listLines, saveVenueAndLines, mergeRecalculation,
  VenueConflictError, UnresolvedLinesError, type StoredLine,
} from '@/data/venueLines'
import { VenueInputsForm } from '@/components/VenueInputsForm'
import { MaterialsTable } from '@/components/MaterialsTable'
import { WarningsPanel } from '@/components/WarningsPanel'
import { exportMaterialsPdf } from '@/pdf/exportMaterials'
import { tierLabel } from '@/lib/tierLabel'
import { Button } from '@/components/ui/button'
import { BrandBlock } from '@/components/BrandBlock'
import { BackToVenues } from '@/components/BackToVenues'
import { ThemeToggle } from '@/components/ThemeToggle'
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

  // The table is a snapshot from the last recalculation, while the checks read
  // the inputs live. Edit courts from 8 to 12 and the sheet still exports the
  // 8-court quantities, with nothing on the page saying so. This detects that
  // gap using the same merge the Recalculate dialog previews.
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
    exportMaterialsPdf(venue.name, tierLabel(venue.tier), lines, catalogAll)
  }

  const onInputs = (inputs: VenueInputs) =>
    setVenue(v => (v ? { ...v, ...inputs } : v))

  const [conflict, setConflict] = useState<VenueConflictError | null>(null)
  const [unresolved, setUnresolved] = useState<StoredLine[] | null>(null)

  /**
   * One transactional call. Previously this was saveVenue followed by saveLines —
   * two independent writes, the second itself a DELETE plus a separate INSERT.
   */
  const save = async (toSave: StoredLine[] = lines, rebased?: Venue) => {
    // `rebased` exists for "Overwrite theirs": that path has to save against a
    // baseline this render does not hold yet. setVenue is asynchronous, so a
    // save fired straight after it would still send the STALE baseline and
    // conflict a second time — the button would appear to do nothing, twice.
    const target = rebased ?? venue
    if (!target || !id) return
    try {
      // Named `written`, not `saved`: Task 6 adds a `saved` snapshot state to
      // this component and the shadowing would be silent.
      const written = await saveVenueAndLines(target, toSave, catalog)
      setVenue(written.venue)
      setLines(written.lines)
      toast.success('Saved')
      return written
    } catch (e) {
      if (e instanceof VenueConflictError) { setConflict(e); return }
      if (e instanceof UnresolvedLinesError) { setUnresolved(e.lines); return }
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
      <aside className="w-full shrink-0 border-b bg-card lg:sticky lg:top-0 lg:flex
                        lg:h-svh lg:w-58 lg:flex-col lg:border-r lg:border-b-0">
        {/* Brand and page identity only — the way back is the row below.

            Navy in light, surface grey in dark. Deliberate asymmetry: mid-navy
            on near-black reads as mud, so after dark the brand carries through
            the reversed wordmark and the gold rule instead.

            Centred, both of them: the rail's content box is 199px and the
            lockup 147.2px, so flush left left 51.8px of empty ground to its
            right and read as shoved aside rather than placed. */}
        <BrandBlock align="center">
          <h1 className="mt-2.5 text-center text-lg font-semibold tracking-tight">
            {venue.name}
          </h1>
        </BrandBlock>
        {/* No sticky offset: from lg the whole aside is sticky, so this rides
            along already. */}
        <BackToVenues />
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
          <ThemeToggle />
          <Button variant="outline" size="sm" className="h-auto bg-card px-[.55rem] py-[.25rem] text-[11px]"
            onClick={recalculate}>
            Recalculate
            {/* The table is stale relative to the inputs. Marking the button is
                what stops the export warning being the first anyone hears of it. */}
            {stale && (
              <span aria-hidden className="ml-1 inline-block size-1.5 rounded-full bg-attention" />
            )}
            {stale && <span className="sr-only">(inputs have changed)</span>}
          </Button>
          <Button variant="outline" size="sm" className="h-auto bg-card px-[.55rem] py-[.25rem] text-[11px]"
            onClick={() => (stale ? setStaleExport(true) : doExport())}>
            Export PDF
          </Button>
          <Button size="sm" className="h-auto px-[.55rem] py-[.25rem] text-[11px]" onClick={() => save()}>
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
            These lines still reflect the inputs as they were at the last
            recalculation. Exporting now hands over quantities that do not match
            the venue on screen.
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

      <Dialog open={conflict !== null} onOpenChange={o => !o && setConflict(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Someone else saved this venue</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            {conflict?.savedByEmail ?? 'Another account'} saved it after you opened
            it. Both ways out lose someone's work, so pick deliberately.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.location.reload()}>
              Reload theirs (discards mine)
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!venue || !conflict) return
                // Rebase onto the baseline the loser just read, then ACTUALLY
                // re-issue. Setting the baseline alone left this button doing
                // nothing at all — it closed the dialog and saved neither
                // version, with nothing on screen saying so.
                const rebased = { ...venue, updatedAt: conflict.savedAt }
                setConflict(null)
                setVenue(rebased)
                await save(lines, rebased)
              }}
            >
              Overwrite theirs
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={unresolved !== null} onOpenChange={o => !o && setUnresolved(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Some lines point at no catalog item</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Nothing was saved. This usually means the item for a role was
            deactivated in the catalog. Removing them here is the only way to
            save this venue without admin access.
          </p>
          <pre className="max-h-56 overflow-auto rounded-md bg-muted p-3 text-xs">
            {unresolved?.map(l => `${l.roleKey ?? 'unknown role'}: ${l.qty}`).join('\n')}
          </pre>
          <div className="flex gap-2">
            <Button onClick={async () => {
              const drop = new Set(unresolved ?? [])
              const kept = lines.filter(l => !drop.has(l))
              setUnresolved(null)
              setLines(kept)
              await save(kept)
            }}>
              Remove these lines and save
            </Button>
            <Button variant="outline" onClick={() => setUnresolved(null)}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
