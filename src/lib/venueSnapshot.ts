import type { Venue } from '@/data/venues'
import type { StoredLine } from '@/data/venueLines'
import type { VenueItemChoice } from '@/data/venueItemChoices'

/**
 * A comparable snapshot of everything a save would write. Unsaved-changes
 * detection is a structural comparison of two of these rather than a flag: a
 * flag has states that can go wrong, a comparison does not.
 *
 * Three exclusions, each load-bearing:
 *
 *   - `updatedAt`, `updatedByEmail` and `createdByEmail` are audit stamps the
 *     server writes. They change on every save without the user having edited
 *     anything, so comparing them reports a venue nobody touched as dirty.
 *
 *   - `id` and `venueId` on a line, because mergeRecalculation mints
 *     `new:${roleKey}` ids with an empty venueId that can never equal what the
 *     RPC returns — comparing them would report dirty on every recalculation.
 *
 *   - choice ORDER, because the set is built from a Set iteration and a
 *     reordering that changes nothing must not read as an edit.
 *
 * Pass the COMPLETE choice set (completeChoiceSet), not the venue's stored
 * choices: it is what the save actually writes, so it is what "unsaved" has to
 * be measured against.
 */
export function venueSnapshot(
  venue: Venue | null,
  lines: StoredLine[],
  choices: VenueItemChoice[],
): string {
  return JSON.stringify({
    venue: venue && {
      ...venue, updatedAt: '', updatedByEmail: '', createdByEmail: '',
    },
    lines: lines.map(({ id: _id, venueId: _venueId, ...rest }) => rest),
    choices: [...choices].sort((a, b) => a.roleKey.localeCompare(b.roleKey)),
  })
}
