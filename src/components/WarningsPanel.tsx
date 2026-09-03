import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Warning } from '@/calculator/types'

const STYLES: Record<Warning['level'], string> = {
  info: 'border-l-muted-foreground/40 bg-muted/40',
  warn: 'border-l-attention bg-attention/10',
  critical: 'border-l-critical bg-critical/10',
  error: 'border-l-destructive bg-destructive/10',
}

// Past this many, the rail is taller than the viewport and the inputs above it
// scroll out of reach — the layout comment in VenueDetail was written when an
// Autonomous venue emitted three checks, and it emits six. Two is where a
// stock Pro venue sits (POE_BUDGET + ACCESS_POINTS_MANUAL), so the common case
// never grows a control that would reveal nothing.
const COLLAPSE_PAST = 2

// The engine emits in sizing order, which is the order an installer reads the
// build in — worth keeping among equals, but it is not importance order.
// POE_BUDGET is the only check whose level moves with the venue (critical past
// 90% of budget) and it lands mid-list, so truncating as emitted would file
// "this venue cannot be wired as spec'd" behind `Show 4 more`. Sorting by level
// first is what makes hiding anything safe.
const RANK: Record<Warning['level'], number> = {
  error: 0, critical: 1, warn: 2, info: 3,
}

export function WarningsPanel({ warnings }: { warnings: Warning[] }) {
  const [expanded, setExpanded] = useState(false)
  if (warnings.length === 0) return null

  const collapsible = warnings.length > COLLAPSE_PAST
  // Stable within a level: Array.prototype.sort is stable per spec, so equal
  // ranks keep their emitted order without a tiebreaker.
  const ordered = [...warnings].sort((a, b) => RANK[a.level] - RANK[b.level])
  const shown = collapsible && !expanded ? ordered.slice(0, COLLAPSE_PAST) : ordered
  const hidden = ordered.length - shown.length

  return (
    <div className="space-y-2">
      <h2 className="flex items-baseline justify-between gap-2 text-[10px]
                     tracking-[.06em] text-muted-foreground uppercase">
        {/* Two on screen and a button does not say the venue has six things
            outstanding. The total is what makes a collapsed panel honest.
            The explicit space is read, not rendered: `justify-between` already
            separates the two, but without it the accessible name of the
            heading is "Checks6". Whitespace-only anonymous boxes are not flex
            items, so it costs nothing on screen. */}
        Checks{' '}
        {collapsible && <span className="tabular-nums">{ordered.length}</span>}
      </h2>
      {shown.map((w, i) => (
        <div key={`${w.code}-${i}`}
          className={`rounded-r-md border-l-[3px] px-[.55rem] py-[.35rem] text-[11px] break-words ${STYLES[w.level]}`}>
          {w.message}
        </div>
      ))}
      {collapsible && (
        <Button variant="outline" size="xs" aria-expanded={expanded}
          className="w-full justify-center text-muted-foreground"
          onClick={() => setExpanded(v => !v)}>
          {expanded ? 'Show less' : `Show ${hidden} more`}
        </Button>
      )}
    </div>
  )
}
