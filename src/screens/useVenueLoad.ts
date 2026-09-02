import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Item } from '@/calculator/types'
import type { Venue } from '@/data/venues'
import type { StoredLine } from '@/data/venueLines'
import type { VenueItemChoice } from '@/data/venueItemChoices'
import { listItems } from '@/data/items'
// Storage, and only storage. Dispatch is on the venue's id, so which store a
// venue lives in is not this hook's business — it never asks.
import { getVenue, listLines, listChoices, isLocalVenueId } from '@/data/venueStore'

/**
 * Everything VenueDetail loads, plus the setters that edit it in place.
 *
 * Be honest about what this is: the screen's whole top-level mutable state,
 * relocated — NOT an encapsulating boundary. Four of these setters are called
 * from six places that have nothing to do with loading (a form edit, a catalog
 * pick, the post-save write-back, a conflict rebase, applying a recalculation,
 * suppressing a row), and the hook does not police any of them.
 *
 * A tighter shape exists — return `{ data, error, signedOut }` and let the
 * screen own its own useState — and it was rejected: it puts a seeding effect
 * back in VenueDetail, and a seeding effect that re-runs is the exact bug the
 * [id]-only array below exists to prevent. This trades a clean boundary for
 * keeping the two dangerous effects in one file that can be read in one sitting.
 */
export interface LoadedVenue {
  venue: Venue | null
  setVenue: React.Dispatch<React.SetStateAction<Venue | null>>
  /**
   * Includes DEACTIVATED items, so a saved line still renders its item's name.
   * The collapsed view the formulas need is derived from this, never fetched
   * again: resolving twice would raise CHOICE_UNAVAILABLE twice and could only
   * name the dead item on one of the two calls.
   */
  catalogAll: Item[]
  lines: StoredLine[]
  setLines: React.Dispatch<React.SetStateAction<StoredLine[]>>
  /**
   * The venue's STORED choices. Deliberately not normalised to the effective
   * set on load: re-resolving against the stored value is what keeps
   * CHOICE_UNAVAILABLE on screen until someone actually picks.
   */
  choices: VenueItemChoice[]
  setChoices: React.Dispatch<React.SetStateAction<VenueItemChoice[]>>
  /**
   * Distinct from `venue === null`, which means "still loading". Conflating the
   * two is what produced a permanent spinner for every failed load.
   */
  loadError: Error | null
  /** The session went away under a venue that needs one to save. */
  signedOut: boolean
  setSignedOut: React.Dispatch<React.SetStateAction<boolean>>
}

/**
 * One fetch of a venue and everything the screen needs to render it, plus the
 * watch for the session disappearing underneath it.
 *
 * Lives beside VenueDetail.tsx rather than in src/hooks/ because it has exactly
 * one consumer and is coupled to the venue domain through its whole surface.
 * The repo's precedent is colocation: auth/useRole.ts sits next to the provider
 * it wraps despite having three consumers. src/hooks/ is for hooks with no
 * domain at all — useUnsavedGuard is the one that qualifies.
 *
 * `setCatalogAll` is deliberately NOT returned: the load is the only thing that
 * may set the catalog, and handing out a setter would invite a second write
 * that the resolution below it could not see.
 */
export function useVenueLoad(
  id: string | undefined, session: Session | null,
): LoadedVenue {
  const [venue, setVenue] = useState<Venue | null>(null)
  const [catalogAll, setCatalogAll] = useState<Item[]>([])
  const [lines, setLines] = useState<StoredLine[]>([])
  const [choices, setChoices] = useState<VenueItemChoice[]>([])
  const [loadError, setLoadError] = useState<Error | null>(null)

  /**
   * Whether this screen has EVER had a session. A visitor who was anonymous
   * from the start has lost nothing and must not meet the signed-out dialog.
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
    // it is supplier and notes, neither of which the screen renders.
    //
    // Moving this into a hook did NOT make the dependency array safer to
    // "correct" — the lint warning it raises is the same one, and it is wrong
    // for the same reason.
  }, [id])

  return {
    venue, setVenue, catalogAll, lines, setLines, choices, setChoices,
    loadError, signedOut, setSignedOut,
  }
}
