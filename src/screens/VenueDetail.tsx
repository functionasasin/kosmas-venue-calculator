import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { calculateBOM } from '@/calculator'
import type { VenueInputs } from '@/calculator/types'
import type { Venue } from '@/data/venues'
import { resolveCatalog, completeChoiceSet } from '@/lib/resolveCatalog'
import { driftWarnings } from '@/lib/driftWarnings'
import { venueSnapshot } from '@/lib/venueSnapshot'
import { ROLE_LABELS, type RoleKey } from '@/calculator/roleKeys'
import {
  mergeRecalculation, VenueConflictError, UnresolvedLinesError, VenueMissingError,
} from '@/data/venueLines'
import type { StoredLine } from '@/data/venueLines'
// Storage, and only storage. The reads moved into useVenueLoad; what is left
// here is the write, and the id-prefix predicate the dialogs ask.
import { saveVenueAndLines, isLocalVenueId } from '@/data/venueStore'
import { VenueInputsForm } from '@/components/VenueInputsForm'
import { MaterialsTable } from '@/components/MaterialsTable'
import { WarningsPanel } from '@/components/WarningsPanel'
import { tierLabel } from '@/lib/tierLabel'
import { Button } from '@/components/ui/button'
import { BrandBlock } from '@/components/BrandBlock'
import { BackToVenues } from '@/components/BackToVenues'
import { SaveStatus, UnsavedStrip } from '@/components/SaveStatus'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useVenueLoad } from './useVenueLoad'
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard'
import { useRole } from '@/auth/useRole'
import { useAuth } from '@/auth/AuthProvider'
import { toast } from 'sonner'
import { diffLines } from '@/lib/diffLines'

export function VenueDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const role = useRole()
  const { session } = useAuth()
  // Load, the session watch, and the two effects whose dependency arrays are
  // the most dangerous lines on this screen — see useVenueLoad.
  const {
    venue, setVenue, catalogAll, lines, setLines, choices, setChoices,
    loadError, signedOut, setSignedOut,
  } = useVenueLoad(id, session)

  const resolved = useMemo(
    () => resolveCatalog(catalogAll, choices),
    [catalogAll, choices],
  )
  // COLLAPSED, and only for the engine and the save. Sizing must target what
  // can actually be bought, and saveVenueAndLines mints item ids from this
  // same array. Everything the user looks at gets catalogAll instead.
  const catalog = useMemo(
    () => resolved.catalog.filter(i => i.isActive),
    [resolved],
  )

  /** What a save writes to venue_item_choices — see completeChoiceSet. */
  const choicesToSave = useMemo(
    () => completeChoiceSet(choices, catalogAll, resolved.chosen),
    [choices, catalogAll, resolved],
  )

  const [pending, setPending] = useState<StoredLine[] | null>(null)

  // Derived, not stored. The previous code set these from an effect that only
  // ran when lines were empty, so every saved venue loaded with no checks and
  // an empty formula map. Deriving makes that state unreachable, and the
  // checks now track the inputs as they are edited.
  const result = useMemo(
    () => (venue && catalog.length > 0 ? calculateBOM(venue, catalog) : null),
    [venue, catalog],
  )
  const formulas = useMemo(
    () => new Map((result?.lines ?? []).map(l => [l.roleKey, l.formula])),
    [result],
  )

  /** Where the list NAMES something the venue is not SIZED on — see driftWarnings. */
  const overridden = useMemo(
    () => driftWarnings(
      choicesToSave.map(c => c.roleKey), lines, catalogAll, resolved.chosen,
    ),
    [choicesToSave, lines, catalogAll, resolved],
  )

  const warnings = [
    ...(result?.warnings ?? []), ...resolved.warnings, ...overridden,
  ]

  /** Recompute and show what would change first — spec §7 requires the diff. */
  const recalculate = () => {
    if (!result) return
    setPending(mergeRecalculation(lines, result.lines, catalog))
  }

  // Memoised like staleRows below, and for the same reason: diffLines builds a
  // Map over the whole catalog, and this recomputed on every re-render while
  // the dialog was open — including renders from typing in the inputs form.
  const diff = useMemo(
    () => (pending ? diffLines(lines, pending, catalogAll) : []),
    [pending, lines, catalogAll],
  )

  // The table is a snapshot from the last recalculation, while the checks read
  // the inputs live. Edit courts from 8 to 12 and the sheet still exports the
  // 8-court quantities, with nothing on the page saying so. This detects that
  // gap using the same merge the Recalculate dialog previews.
  const staleRows = useMemo(
    () => (result
      ? diffLines(lines, mergeRecalculation(lines, result.lines, catalog), catalogAll)
      : []),
    [result, lines, catalog, catalogAll],
  )
  const stale = staleRows.length > 0

  // Only an empty venue is populated automatically. Applying on every load
  // would resurrect lines the user suppressed.
  useEffect(() => {
    if (result && lines.length === 0) {
      setLines(current => mergeRecalculation(current, result.lines, catalog))
    }
  }, [result, lines.length])

  const [staleExport, setStaleExport] = useState(false)
  const [exporting, setExporting] = useState(false)

  /**
   * FETCHED ON THE CLICK, not shipped in the entry chunk. jsPDF,
   * jspdf-autotable and the base64 letterhead are ~474 kB of the build (169 kB
   * gzipped) reachable from this one button on this one screen, and a static
   * import put all of it in front of every visitor who only wanted to size a
   * venue: the entry chunk was 1194 kB and is 721 kB with this import deferred.
   *
   * The catch is not decoration, and it covers the render as well as the fetch.
   * The fetch is the one call on this screen that can fail for a reason
   * unrelated to the venue — Pages serves hashed chunks, so a tab left open
   * across a deploy asks for a file that is no longer there — and without the
   * catch the button would silently do nothing. Leaving the render outside it
   * would be worse than not catching at all: `exporting` would never clear and
   * the button would stay disabled for the rest of the session.
   *
   * TWO FAILURES, TWO MESSAGES, and `loaded` is what tells them apart. They
   * want opposite things from the reader, so one message cannot serve both:
   *
   *   - The chunk did not load. Reloading is the ONLY cure and pressing the
   *     button again can never work: a module that fails to load is recorded as
   *     errored in the page's module map, so every later import() of it
   *     re-rejects from memory without even re-requesting the file
   *     (lazy-pdf-chunk.mjs measures exactly that). The browser's own text here
   *     is `Failed to fetch dynamically imported module: <hashed url>` — jargon
   *     plus an asset path, nothing the reader can act on — so it is dropped.
   *
   *   - The exporter loaded and then threw. Reloading changes nothing, a retry
   *     is legitimate, and the thrown message is the only diagnostic there is,
   *     so it is kept and no reload is suggested.
   */
  const doExport = async () => {
    if (!venue || exporting) return
    setStaleExport(false)
    setExporting(true)
    let loaded = false
    try {
      const { exportMaterialsPdf } = await import('@/pdf/exportMaterials')
      loaded = true
      // `Venue extends VenueInputs`, so the venue satisfies the parameter with
      // no adapter — and the port plan is then sized from the same object the
      // inputs form edits.
      exportMaterialsPdf(
        venue.name, tierLabel(venue.tier), lines, catalogAll, venue,
      )
    } catch (e) {
      toast.error(loaded
        ? `Could not export the PDF: ${(e as Error).message}`
        : 'The PDF exporter could not be loaded. This usually means the app ' +
          'was updated while this tab was open — reload the page and try again.')
    } finally {
      setExporting(false)
    }
  }

  const onInputs = (inputs: VenueInputs) =>
    setVenue(v => (v ? { ...v, ...inputs } : v))

  /**
   * The venue's pick for one role key, from the materials table's swap
   * control. Replaces the role's previous entry rather than appending: a
   * second pick for the same role would otherwise leave two rows for
   * choicesToSave to pick between by scan order.
   */
  const pick = (roleKey: RoleKey, itemId: string) =>
    setChoices(cs => [...cs.filter(c => c.roleKey !== roleKey), { roleKey, itemId }])

  const [conflict, setConflict] = useState<VenueConflictError | null>(null)
  const [unresolved, setUnresolved] = useState<StoredLine[] | null>(null)

  const [saved, setSaved] = useState<string | null>(null)

  // Captured AFTER the auto-populate effect settles, not at load: a venue
  // created from Venues arrives with no lines, the effect fills them, and a
  // load-time snapshot would report a venue nobody touched as dirty.
  useEffect(() => {
    // `result.lines.length === 0` is the third case and it is load-bearing:
    // calculateBOM returns no lines for a blocked tier (basic/basic_plus) and
    // for PORT_CEILING, while `result` is NOT null. Without it the snapshot
    // never armed on those venues, `dirty` stayed false forever, and editing a
    // Basic venue to upgrade it — the whole reason to open one — lost the edits
    // with no dialog and no beforeunload.
    //
    // `choicesToSave` is correct in this dependency array without being added
    // for a subtler reason — all four load states settle in one batched
    // `.then` — but relying on that is not something the next reader should
    // have to work out.
    if (venue && saved === null &&
        (result === null || lines.length > 0 || result.lines.length === 0)) {
      setSaved(venueSnapshot(venue, lines, choicesToSave))
    }
  }, [venue, lines, result, saved, choicesToSave])

  // Memoised for the same reason as `diff` and `staleRows`: this screen
  // re-renders for a great deal that cannot affect the answer — every dialog
  // opening and closing, `saving`, `exporting`, the theme toggle — and
  // venueSnapshot allocates a stripped copy of every line and serialises the
  // lot on each one. Keyed on the three things a save actually writes.
  const snapshot = useMemo(
    () => venueSnapshot(venue, lines, choicesToSave),
    [venue, lines, choicesToSave],
  )
  const dirty = saved !== null && saved !== snapshot

  const [leaving, setLeaving] = useState(false)

  // Tab close and reload — see useUnsavedGuard. The in-app exit is the
  // BackToVenues intercept below.
  const discarding = useUnsavedGuard(dirty)

  /**
   * One transactional call. Previously this was saveVenue followed by saveLines —
   * two independent writes, the second itself a DELETE plus a separate INSERT.
   */
  // A ref, not the `saving` state: two clicks in the same tick both read the
  // pre-update state and both fire. Without this they issue two RPCs carrying
  // the SAME baseline, the second loses the race, and the conflict dialog tells
  // the user someone else saved the venue — naming themselves.
  const inFlight = useRef(false)
  const [saving, setSaving] = useState(false)

  const save = async (toSave: StoredLine[] = lines, rebased?: Venue) => {
    if (inFlight.current) return
    inFlight.current = true
    setSaving(true)
    try {
      return await runSave(toSave, rebased)
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  const runSave = async (toSave: StoredLine[] = lines, rebased?: Venue) => {
    // `rebased` exists for "Overwrite theirs": that path has to save against a
    // baseline this render does not hold yet. setVenue is asynchronous, so a
    // save fired straight after it would still send the STALE baseline and
    // conflict a second time — the button would appear to do nothing, twice.
    const target = rebased ?? venue
    if (!target || !id) return
    try {
      // Named `written`, not `saved`: Task 6 adds a `saved` snapshot state to
      // this component and the shadowing would be silent.
      const written = await saveVenueAndLines(target, toSave, catalog, choicesToSave)
      setVenue(written.venue)
      setLines(written.lines)
      setChoices(written.choices)
      // Without this the snapshot stays at pre-save state and the venue reads
      // as permanently dirty — the guard would then fire on every exit, and a
      // guard that always fires is one people learn to click through.
      setSaved(venueSnapshot(written.venue, written.lines, written.choices))
      toast.success('Saved')
      return written
    } catch (e) {
      if (e instanceof VenueConflictError) { setConflict(e); return }
      if (e instanceof UnresolvedLinesError) { setUnresolved(e.lines); return }
      // The venue is not there to save into — the RPC's row lock found nothing
      // under RLS (PT404), or the blob was deleted in another tab. Same dialog
      // as a lost session, because the user's position is identical: this page
      // cannot be saved, and the honest thing is to say so and offer the way
      // out rather than let a toast clear itself over a screen that still looks
      // editable.
      if (e instanceof VenueMissingError) { setSignedOut(true); return }
      toast.error((e as Error).message)
    }
  }

  if (loadError) {
    const missing = loadError instanceof VenueMissingError
    return (
      // The same shell as the rest of the app rather than a bare <p>: this is
      // now a page an anonymous visitor can land on directly from a shared
      // link, so it is a destination, not an error state inside a session.
      <div className="flex min-h-svh flex-col bg-card">
        <BrandBlock />
        <BackToVenues />
        <div className="p-8 text-sm text-muted-foreground">
          {missing
            ? 'This venue isn’t here. It may have been deleted, or it belongs ' +
              'to an account you are not signed in to — venues saved without ' +
              'signing in live only in the browser that made them.'
            : loadError.message}
        </div>
      </div>
    )
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
          {/* Who saved this and when used to sit here, under the name. It moved
              to SaveStatus at the foot of the rail: --muted-foreground is mixed
              for white surfaces and came out at 1.46:1 on this band's navy. */}
        </BrandBlock>
        {/* No sticky offset: from lg the whole aside is sticky, so this rides
            along already. */}
        <BackToVenues onIntercept={() => {
          if (dirty) { setLeaving(true); return true }
          return false
        }} />
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
          {/* First, so a justify-end bar leaves it leftmost in the cluster —
              a few pixels from Save, which is the control that clears it. */}
          <SaveStatus dirty={dirty} updatedByEmail={venue.updatedByEmail}
            updatedAt={venue.updatedAt} local={isLocalVenueId(venue.id)} />
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
          {/* Disabled and relabelled for the chunk fetch above, which is the
              only part of an export that is not synchronous. Without it a slow
              connection reads as a dead button and gets clicked again. */}
          <Button variant="outline" size="sm" disabled={exporting}
            className="h-auto bg-card px-[.55rem] py-[.25rem] text-[11px]"
            onClick={() => (stale ? setStaleExport(true) : doExport())}>
            {exporting ? 'Exporting…' : 'Export PDF'}
          </Button>
          <Button size="sm" disabled={saving}
            className="h-auto px-[.55rem] py-[.25rem] text-[11px]" onClick={() => save()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
        {/* Mobile only, and only while dirty — see SaveStatus. Sits directly
            under the h-13 bar and sticks with it. */}
        <UnsavedStrip dirty={dirty} />

        <div className="min-w-0 flex-1 py-4">
          <MaterialsTable lines={lines} catalog={catalogAll} chosen={resolved.chosen}
            formulas={formulas} onChange={setLines} isAdmin={role === 'admin'}
            onPick={pick} />
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

      {/* Not dismissible: behind it is a venue whose Save cannot succeed, so
          closing this would return the user to a screen that looks fine and is
          not. onOpenChange is deliberately absent — Dialog then has no path to
          close itself.

          A toast was the alternative and is wrong twice over: it auto-dismisses,
          and a programmatic navigate('/') bypasses BackToVenues' onIntercept and
          the `leaving` guard, so the edits would disappear with nothing on
          screen having said they were at risk. */}
      <Dialog open={signedOut}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>You have been signed out</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This venue is stored in the database, so saving it needs a signed-in
            account. Any unsaved edits on this page are lost — there is no way to
            keep them without signing in again first.
          </p>
          <div className="flex gap-2">
            {/* The only exit. "Save and leave" would offer something that
                cannot succeed: the RPC's row lock finds nothing under RLS. */}
            <Button onClick={() => { discarding.current = true; navigate('/') }}>
              Back to all venues
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={conflict !== null} onOpenChange={o => !o && setConflict(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {venue && isLocalVenueId(venue.id)
                ? 'This venue changed in another tab'
                : 'Someone else saved this venue'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {/* A local venue has no accounts behind it and no other people:
                localStorage is per browser profile, so the only other writer is
                a second tab — which is how anyone compares two configurations.
                Falling through to "Another account" would name something that
                does not exist and point the user at nothing they can check.

                Asked the same way the session watch and SaveStatus ask it.
                VenueConflictError briefly carried its own `local` flag; it was
                removed because this screen has to call isLocalVenueId anyway,
                and one fact with two sources is worse than one. */}
            {venue && isLocalVenueId(venue.id)
              ? 'Another tab in this browser saved it after you opened it.'
              : `${conflict?.savedByEmail ?? 'Another account'} saved it after you opened it.`}
            {' '}Both ways out lose someone's work, so pick deliberately.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => {
              // Already a confirmed discard — suppress the native prompt.
              discarding.current = true
              window.location.reload()
            }}>
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
            {/* The role's LABEL, the same string diffLines puts in the
                recalculate and stale dialogs — this list is what the user reads
                to decide whether losing these lines is acceptable, and
                `ipad_poe_adapter: 8` does not tell them an iPad PoE adapter is
                about to leave the venue.

                A null role gets "Manual line" rather than the item name
                diffLines would reach for: these lines are unresolved, which is
                to say no item was found for them, so there is no name to
                print. */}
            {unresolved?.map(l =>
              `${l.roleKey ? ROLE_LABELS[l.roleKey] : 'Manual line'}: ${l.qty}`,
            ).join('\n')}
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

      <Dialog open={leaving} onOpenChange={setLeaving}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>You have unsaved changes</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Nothing on this page is saved until you press Save. Leaving now discards
            the edits, including any hand-set quantities.
          </p>
          <div className="flex gap-2">
            {/* `save` swallows every failure and returns undefined, so
                navigating unconditionally unmounted this screen before the
                conflict dialog could render — losing the edits on the one exit
                the user picked in order to KEEP them. Close this dialog either
                way so the failure is visible; leave only if it truly saved. */}
            <Button disabled={saving} onClick={async () => {
              const written = await save()
              setLeaving(false)
              if (written) { discarding.current = true; navigate('/') }
            }}>
              Save and leave
            </Button>
            <Button variant="destructive" onClick={() => {
              discarding.current = true; setLeaving(false); navigate('/')
            }}>
              Discard and leave
            </Button>
            <Button variant="outline" onClick={() => setLeaving(false)}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
