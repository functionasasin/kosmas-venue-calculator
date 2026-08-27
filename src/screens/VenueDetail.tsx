import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { calculateBOM } from '@/calculator'
import type { Item, VenueInputs, Warning } from '@/calculator/types'
import type { Venue } from '@/data/venues'
import { listItems } from '@/data/items'
import type { VenueItemChoice } from '@/data/venueItemChoices'
import { resolveCatalog, multiOptionRoles } from '@/lib/resolveCatalog'
import { itemsById } from '@/lib/sections'
import { ROLE_LABELS, type RoleKey } from '@/calculator/roleKeys'
import {
  mergeRecalculation, VenueConflictError, UnresolvedLinesError, VenueMissingError,
} from '@/data/venueLines'
import type { StoredLine } from '@/data/venueLines'
// Storage, and only storage. Dispatch is on the venue's id, so which store a
// venue lives in is not this screen's business — it never asks.
import {
  getVenue, listLines, listChoices, saveVenueAndLines, isLocalVenueId,
} from '@/data/venueStore'
import { VenueInputsForm } from '@/components/VenueInputsForm'
import { MaterialsTable } from '@/components/MaterialsTable'
import { WarningsPanel } from '@/components/WarningsPanel'
import { exportMaterialsPdf } from '@/pdf/exportMaterials'
import { tierLabel } from '@/lib/tierLabel'
import { Button } from '@/components/ui/button'
import { BrandBlock } from '@/components/BrandBlock'
import { BackToVenues } from '@/components/BackToVenues'
import { SaveStatus, UnsavedStrip } from '@/components/SaveStatus'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useRole } from '@/auth/useRole'
import { useAuth } from '@/auth/AuthProvider'
import { toast } from 'sonner'
import { diffLines } from '@/lib/diffLines'

export function VenueDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const role = useRole()
  const { session } = useAuth()
  const [venue, setVenue] = useState<Venue | null>(null)
  // ONE catalog in state, everything else derived. `catalogAll` includes
  // deactivated items so a saved line still renders its item's name; the
  // collapsed view the formulas need is derived from it, not fetched again.
  // Resolving twice would raise CHOICE_UNAVAILABLE twice and could only name
  // the dead item on one of the two calls.
  const [catalogAll, setCatalogAll] = useState<Item[]>([])
  const [lines, setLines] = useState<StoredLine[]>([])
  // The venue's STORED choices. Deliberately not normalised to the effective
  // set on load: re-resolving against the stored value is what keeps
  // CHOICE_UNAVAILABLE on screen until someone actually picks.
  const [choices, setChoices] = useState<VenueItemChoice[]>([])
  // Distinct from `venue === null`, which means "still loading". Conflating the
  // two is what produced a permanent spinner for every failed load.
  const [loadError, setLoadError] = useState<Error | null>(null)

  /**
   * Whether this screen has EVER had a session. A visitor who was anonymous
   * from the start has lost nothing and must not meet the dialog below.
   */
  const hadSession = useRef(!!session)
  const [signedOut, setSignedOut] = useState(false)

  useEffect(() => {
    // Only a DATABASE venue is affected. A local one keeps routing to
    // localStorage under id dispatch and saves exactly as before — spec §3.12.
    if (hadSession.current && !session && venue && !isLocalVenueId(venue.id)) {
      setSignedOut(true)
    }
    hadSession.current = hadSession.current || !!session
  }, [session, venue])

  useEffect(() => {
    if (!id) return
    Promise.all([getVenue(id), listItems(!!session, true), listLines(id), listChoices(id)])
      .then(([v, all, l, c]) => {
        setVenue(v); setCatalogAll(all); setLines(l); setChoices(c)
      })
      .catch(e => setLoadError(e as Error))
    // KEYED ON [id] AND NOTHING ELSE. Adding `session` re-runs setVenue,
    // setLines and setChoices and DESTROYS UNSAVED EDITS on every hourly token
    // refresh and on a sign-in in another tab. listItems' argument is
    // deliberately allowed to go stale: the only thing a session changes about
    // it is supplier and notes, neither of which this screen renders.
  }, [id])

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

  /**
   * The venue's FULL choice set, in the form the RPC wants. save_venue deletes
   * and re-inserts, so anything missing here is DELETED — which makes this the
   * one place a venue's pins can be silently lost.
   *
   * Two sources, unioned:
   *
   *   - every role that currently has more than one active item, pinned to
   *     whatever it resolved to. This is what makes a venue that never chose
   *     pin its default on first save, so a later default flip cannot move it.
   *
   *   - every role the venue already has a stored choice for. Necessary
   *     because "has more than one active item" is a CURRENT fact and §3's
   *     invariant is a historical one: deactivate the Dahua and replay_camera
   *     stops being contested, so a set derived from the first source alone
   *     would drop the pin on the next save of that venue for any unrelated
   *     reason — and reactivating the Dahua later would find every venue
   *     silently following the catalog default again.
   *
   * The venue's stored choice always wins over the resolution, including when
   * that choice has been deactivated. `resolved.chosen` holds a FALLBACK in
   * that case — the catalog default, or the sole remaining active item — and
   * it exists to size and display the venue's list while the pick is broken,
   * not to replace the pick. Saving the fallback over the stored id would
   * silently swap the venue onto the catalog default the moment anything else
   * triggers a save, and reactivating the item later would never undo it,
   * because by then nothing on screen says the pin is gone. The stored choice
   * is only ever replaced by the user actually picking something in a row's
   * swap control.
   *
   * `resolved.chosen` only fills a role the venue has never pinned: a venue
   * that never chose still pins the role's current resolution on its first
   * save, so a later default flip cannot move it. A role that resolved to
   * NOTHING keeps the venue's stored id untouched either way: ROLE_NO_DEFAULT
   * is an admin problem, and throwing away the user's pick while they fix it
   * would be this component destroying data it cannot restore.
   */
  const choicesToSave = useMemo(() => {
    const stored = new Map(choices.map(c => [c.roleKey, c.itemId]))
    const roles = new Set<RoleKey>([
      ...multiOptionRoles(catalogAll).keys(),
      ...stored.keys(),
    ])
    return [...roles].flatMap(roleKey => {
      const itemId = stored.get(roleKey) ?? resolved.chosen.get(roleKey)
      return itemId ? [{ roleKey, itemId }] : []
    })
  }, [choices, catalogAll, resolved])

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

  /**
   * What the venue is SIZED on, versus what its list actually names.
   *
   * calculateBOM reads the inputs and the resolved catalog, never the stored
   * lines, so a hand-edited line cannot change the rung, the port count or the
   * PoE budget — it only changes what gets printed. mergeRecalculation leaves
   * manual lines alone, deliberately, so the two can drift apart with nothing
   * on screen saying so, and the printed sheet is where it would be found.
   *
   * Two ways they drift, and both are reported:
   *
   *   - the role's line still fills it but names a different item. The swap
   *     control writes the venue's choice for a same-role swap now, so the
   *     live way to reach this is gone; what remains is a line hand-swapped
   *     before that delegation existed, and a role holding a second line. An
   *     item that AGREES is not reported — a manual line freezes its quantity,
   *     which is not this warning's business.
   *
   *   - the line was swapped to another role's item entirely. It keeps its new
   *     roleKey and records the vacated one in originRoleKey (MaterialsTable's
   *     swap()), so a plain roleKey match misses it — and it is the worse of
   *     the two, because nothing on the list fills the role at all while the
   *     venue is still sized as though something does.
   *
   * `resolved.chosen`, NOT the entry in choicesToSave, is what "sized on"
   * means. choicesToSave deliberately carries the venue's STORED pin so a save
   * cannot overwrite it, and the two disagree in exactly the state this warning
   * is most likely to be read in: a pin whose item was deactivated sizes the
   * venue on the fallback while the stored id still names the dead item.
   * Comparing against the pin there reports a drift between two items the venue
   * is not sized on either way, and stays silent on the line that really has
   * drifted.
   *
   * A role can hold more than one manual line — a hand-edited formula line plus
   * one added by hand — so the FIRST match is not good enough: it can agree
   * while a second line prints an item the venue is not sized on. The one that
   * actually drifted is the one worth naming.
   */
  const overridden = useMemo<Warning[]>(() => {
    const byId = itemsById(catalogAll)
    const warn = (message: string): Warning[] =>
      [{ code: 'CHOICE_OVERRIDDEN', level: 'warn' as const, message }]

    return choicesToSave.flatMap(c => {
      const sizedId = resolved.chosen.get(c.roleKey)
      // The role resolved to nothing at all. ROLE_NO_DEFAULT already says so,
      // and there is no item to say the list disagrees with.
      if (!sizedId) return []

      const line = lines.find(
        l => (l.roleKey === c.roleKey || l.originRoleKey === c.roleKey)
          && l.source === 'manual' && !l.suppressed
          && (l.roleKey !== c.roleKey || l.itemId !== sizedId),
      )
      if (!line) return []
      const itemName = byId.get(line.itemId)?.name ?? 'its item'
      const roleLabel = ROLE_LABELS[c.roleKey].toLowerCase()

      if (line.roleKey === c.roleKey) {
        const sizedName = byId.get(sizedId)?.name ?? 'another item'
        return warn(
          `The ${roleLabel} line on this list was edited by hand and still ` +
          `names "${itemName}", but this venue is sized on "${sizedName}". ` +
          'Remove the line and recalculate to bring the two back in step.',
        )
      }

      // Naming the swap target's own role in parens when it has one: a line
      // can land on a roleless item (a cable, say — roleKey null is a real
      // state, not just the freshly-added case), and there is nothing to name
      // there beyond the item itself.
      return warn(
        `The ${roleLabel} line on this list was hand-swapped to ` +
        `"${itemName}"${line.roleKey ? ` (${ROLE_LABELS[line.roleKey].toLowerCase()})` : ''}, ` +
        `so nothing on this list fills ${roleLabel} any more — though the ` +
        'venue is still sized as if something does. Remove the line and ' +
        'recalculate to bring it back.',
      )
    })
  }, [choicesToSave, lines, catalogAll, resolved])

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

  const doExport = () => {
    if (!venue) return
    setStaleExport(false)
    exportMaterialsPdf(venue.name, tierLabel(venue.tier), lines, catalogAll)
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

  /**
   * Compared structurally against the current state rather than tracked with a
   * flag: a flag has states that can go wrong, a comparison does not. Same
   * reasoning as `result` and `warnings` being derived.
   *
   * `id` and `venueId` are excluded because mergeRecalculation mints
   * `new:${roleKey}` ids with an empty venueId that can never equal what the RPC
   * returns — comparing them would report dirty on every recalculation.
   *
   * `choicesToSave`, not `choices`: it is what the save writes, so it is what
   * "unsaved" has to be measured against. Sorted, because the array's order
   * comes from a Set iteration and a reordering that changes nothing must not
   * read as an edit.
   */
  const projection = (
    v: Venue | null, ls: StoredLine[], cs: VenueItemChoice[],
  ) => JSON.stringify({
    venue: v && { ...v, updatedAt: '', updatedByEmail: '', createdByEmail: '' },
    lines: ls.map(({ id: _id, venueId: _v, ...rest }) => rest),
    choices: [...cs].sort((a, b) => a.roleKey.localeCompare(b.roleKey)),
  })

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
      setSaved(projection(venue, lines, choicesToSave))
    }
  }, [venue, lines, result, saved, choicesToSave])

  const dirty = saved !== null && saved !== projection(venue, lines, choicesToSave)

  const [leaving, setLeaving] = useState(false)

  // Set immediately before a navigation the user has ALREADY confirmed, so the
  // browser does not stack its own "Leave site?" prompt on top — which phrases
  // itself as a warning against the very thing they just chose.
  const discarding = useRef(false)

  // Tab close and reload. The in-app exit is the BackToVenues intercept below.
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (discarding.current) return
      e.preventDefault()
      // Chrome and Firefox honour preventDefault alone; Safari has historically
      // needed returnValue, and without it the guard simply does not appear.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

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
      setSaved(projection(written.venue, written.lines, written.choices))
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
          <Button variant="outline" size="sm" className="h-auto bg-card px-[.55rem] py-[.25rem] text-[11px]"
            onClick={() => (stale ? setStaleExport(true) : doExport())}>
            Export PDF
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
