/**
 * Who saved this venue and when, and whether there are edits nobody has saved.
 *
 * Two exports because the answer differs by width, not because there are two
 * features: `SaveStatus` is the line in the toolbar from `sm` up, and
 * `UnsavedStrip` is what a phone gets instead.
 *
 * The venue page tracks two different kinds of out-of-date and they are not
 * interchangeable:
 *
 *   - `stale` — the table disagrees with the inputs. Fixed by Recalculate,
 *     and already marked by the amber dot on that button.
 *   - `dirty` — the page disagrees with the database. Fixed by Save, and until
 *     now marked by nothing: the guard dialog on the way out was the first
 *     anyone heard of it.
 *
 * Recalculating clears the amber dot and leaves `dirty` true, so that state was
 * both the most common and the least visible.
 *
 * Why the toolbar and not the rail: the bar is `sticky top-0`, so it is on
 * screen while the user works. This line first shipped at the foot of the rail
 * (2026-08-19) where it scrolled out of view on a long inputs panel — which is
 * exactly when the edits it warns about are being made. Sitting beside Save
 * also puts the warning next to the control that clears it.
 */
export function SaveStatus({
  dirty,
  updatedByEmail,
  updatedAt,
  local = false,
}: {
  dirty: boolean
  updatedByEmail: string | null
  updatedAt: string
  /**
   * The venue lives in this browser's localStorage rather than the database.
   * Optional and defaulting false so the database path — every caller before
   * this one — needs no change.
   */
  local?: boolean
}) {
  // Nothing to say: an unedited venue from before migration 0006, which has no
  // recorded author. "Saved by unknown" would state something the row does not.
  // A local venue is NOT that case — it has no author by design, and saying
  // nothing after a successful save is exactly the wrong answer there.
  if (!dirty && !updatedByEmail && !local) return null

  return (
    // max-sm:hidden, not a second component: the bar carries a theme toggle and
    // three buttons and is near full at 390px, so left in the flow this wraps it
    // to a second row — and the bar is sticky, so that row would then follow the
    // user down every scroll of a long table. UnsavedStrip covers mobile.
    //
    // First child of a justify-end bar, so it sits leftmost in the right-hand
    // cluster, immediately before the toggle and a few pixels from Save.
    <span className="max-sm:hidden min-w-0 truncate text-[11px] text-muted-foreground">
      {dirty ? (
        // Replaces rather than joins the saved-by line: while you are mid-edit
        // the last-saved fact describes a version no longer on screen.
        <span className="font-medium text-foreground">Unsaved changes</span>
      ) : local ? (
        // BEFORE the saved-by branch, and that order is load-bearing: a local
        // venue's updatedByEmail is null, and the branch below asserts it
        // non-null and hands it to localPart(), which would throw on null.
        //
        // The title is the disclosure. localStorage is per browser PROFILE, so
        // this venue is not on the user's phone, not on a colleague's laptop,
        // and gone the moment site data is cleared — none of which is guessable
        // from a line that just says "Saved".
        <span title={`Stored only in this browser, ${longStamp(updatedAt)}. Clearing this browser's site data deletes it.`}>
          Saved in this browser
          {' · '}
          {shortDate(updatedAt)}
        </span>
      ) : (
        <span title={`Last saved by ${updatedByEmail} on ${longStamp(updatedAt)}`}>
          Saved by <span className="font-medium">{localPart(updatedByEmail!)}</span>
          {' · '}
          {shortDate(updatedAt)}
        </span>
      )}
    </span>
  )
}

/**
 * The phone's version: nothing at all until there is something to lose.
 *
 * A permanent line here is paid for on every scroll, and the two facts are not
 * worth the same — "who saved this in August" cannot cost anyone work, and
 * unsaved edits can. So mobile spends the 30px only on the second, and drops
 * the provenance entirely rather than half-showing both.
 *
 * top-13 is the h-13 bar above it, the same pairing Catalog uses for its back
 * row. It has to stay pinned: a warning that scrolls away is missing precisely
 * while the user is moving through the table they are editing.
 *
 * bg-decide, NOT the bg-attention/10 the checks panel uses. That wash is 90%
 * transparent, which is fine in normal flow and wrong here — this is sticky, so
 * the table scrolls *under* it and the rows show straight through the warning.
 * Same rule the h-13 bar above already records. --decide is the opaque amber
 * band, and --attention-foreground is the text already paired with it: 4.87:1
 * light, 7.63:1 dark.
 */
export function UnsavedStrip({ dirty }: { dirty: boolean }) {
  if (!dirty) return null

  return (
    <div className="sticky top-13 z-10 flex items-center gap-1.5 border-b
                    bg-decide px-4 py-1.5 text-[11px] font-medium
                    text-attention-foreground sm:hidden">
      <span aria-hidden className="size-1.5 rounded-full bg-attention" />
      Unsaved changes
    </div>
  )
}

// Every address here is @kosmas.com.ph, so the domain is the half that carries
// no information in a bar shared with three buttons. The title keeps the whole
// thing, which is what tells two similar local parts apart.
const localPart = (email: string) => email.split('@')[0]

/**
 * en-PH with an explicit month, matching exportMaterials.ts, so the bar and the
 * exported PDF cannot disagree about the same venue.
 *
 * The bare toLocaleDateString() this replaces read the browser's locale: the
 * same row rendered 8/19/2026 on a US-configured machine and 19/8/2026 on a PH
 * one, with nothing on screen saying which order you were looking at. A month
 * name has no second reading.
 *
 * en-PH is month-first, so this comes out "Aug 19, 2026" rather than the
 * day-first form a narrow bar would prefer. Matching the PDF is worth more than
 * the shorter line: the two printing one venue differently is the problem being
 * solved, not a detail of it.
 *
 * Both helpers take a COPY. venue.updatedAt is the optimistic-lock baseline and
 * must never be round-tripped through a Date — parsing and reformatting it
 * drops the microseconds the lock compares on.
 */
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-PH', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

const longStamp = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
