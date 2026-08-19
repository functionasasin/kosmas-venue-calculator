/**
 * The rail's foot: who saved this venue and when, or that you have edits that
 * nobody has saved yet.
 *
 * It used to be a line inside BrandBlock, under the venue name, and it was
 * unreadable there — --muted-foreground is a grey mixed for white surfaces, so
 * on the band's navy --railhd it came out at 1.46:1, below even the 3:1 floor
 * for large text. The fix is the ground, not the grey: on --card the same token
 * is 5.40:1, which is what BackToVenues already banks on one row above.
 *
 * Moving it also let it pick up the state that had no indicator at all. The
 * venue page tracks two different kinds of out-of-date and they are not
 * interchangeable:
 *
 *   - `stale` — the table disagrees with the inputs. Fixed by Recalculate,
 *     and already marked by the amber dot on that button.
 *   - `dirty` — the page disagrees with the database. Fixed by Save, and until
 *     now marked by nothing: the guard dialog on the way out was the first
 *     anyone heard of it.
 *
 * Recalculating clears the amber dot and leaves `dirty` true, so that state was
 * both the most common and the least visible. Deliberately NOT a second dot:
 * --attention (#F0B100) and --gold (#D2AB67) are close enough that two of them
 * on one screen read as the same signal.
 */
export function SaveStatus({
  dirty,
  updatedByEmail,
  updatedAt,
}: {
  dirty: boolean
  updatedByEmail: string | null
  updatedAt: string
}) {
  // Nothing to say: an unedited venue from before migration 0006, which has no
  // recorded author. "Saved by unknown" would state something the row does not.
  if (!dirty && !updatedByEmail) return null

  return (
    // mt-auto pins this to the foot of the rail from lg, where the aside is a
    // flex column and the inputs area is the only thing that scrolls. Below lg
    // the aside is a plain block and mt-auto is inert, so it simply follows the
    // checks — which is the right place there too, since there is no viewport
    // bottom to pin to when the whole page scrolls.
    <div className="mt-auto border-t px-4 py-2 text-[11px] text-muted-foreground">
      {dirty ? (
        // Replaces rather than joins the saved-by line: one line at 232px, and
        // while you are mid-edit the last-saved fact describes a version that
        // is no longer on screen.
        <span className="font-medium text-foreground">Unsaved changes</span>
      ) : (
        <span
          className="block truncate"
          title={`Last saved by ${updatedByEmail} on ${longStamp(updatedAt)}`}
        >
          Saved by <span className="font-medium">{localPart(updatedByEmail!)}</span>
          {' · '}
          {shortDate(updatedAt)}
        </span>
      )}
    </div>
  )
}

// Every address here is @kosmas.com.ph, so the domain is the half that carries
// no information in a 232px rail. The title keeps the whole thing, which is
// what tells two similar local parts apart.
const localPart = (email: string) => email.split('@')[0]

/**
 * en-PH with an explicit month, matching exportMaterials.ts, so the rail and
 * the exported PDF cannot disagree about the same venue.
 *
 * The bare toLocaleDateString() this replaces read the browser's locale: the
 * same row rendered 8/19/2026 on a US-configured machine and 19/8/2026 on a PH
 * one, with nothing on screen saying which order you were looking at. A month
 * name has no second reading.
 *
 * en-PH is month-first, so this comes out "Aug 19, 2026" rather than the
 * day-first form a narrow rail would prefer. Matching the PDF is worth more
 * than the shorter line: the two printing the same venue differently is the
 * problem being solved, not a detail of it.
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
