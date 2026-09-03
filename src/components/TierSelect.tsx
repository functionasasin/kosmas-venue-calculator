import type { Tier } from '@/calculator/types'
import { tierLabel, TIERS } from '@/lib/tierLabel'

/**
 * The tier picker, in the two places that offer one: the venue rail's Tier
 * field and the New venue dialog.
 *
 * `TIERS` was already shared so the two lists could not fork — see tierLabel.ts
 * for why, and for the fork that nearly happened. What was still written twice
 * is the RENDERING of that list: both sites mapped it to `<option>` labelled by
 * `tierLabel`, so a change to how a tier is presented — a disabled option for
 * the blocking tiers, say, or a grouped list — had two places to land and one
 * of them would be missed.
 *
 * `className` stays a prop rather than being fixed here: the rail's field is
 * `h-8` to line up with the `<Input>`s beside it, and the dialog's is `p-2` to
 * sit level with the two `<Input>`s above it. That is a real difference between
 * two containers, not a fork, so the caller keeps it.
 *
 * Still a native `<select>`, like both call sites were. Migrating these to the
 * Base UI `Select` is a separate question with its own testing cost — this
 * change is not the place to decide it.
 */
export function TierSelect(
  { id, value, onChange, className }: {
    id: string
    value: Tier
    onChange: (tier: Tier) => void
    className?: string
  },
) {
  return (
    <select id={id} className={className} value={value}
      onChange={e => onChange(e.target.value as Tier)}>
      {TIERS.map(t => (
        <option key={t} value={t}>{tierLabel(t)}</option>
      ))}
    </select>
  )
}
