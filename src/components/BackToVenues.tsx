import { Link } from 'react-router-dom'
import { ChevronLeftIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The way back to the venue list, shared by Catalog and the venue page so the
 * two agree. It is a full-width row in the slot between a screen's header block
 * and its content — deliberately not a link inside the header, which is what
 * both screens had until 2026-08-14:
 *
 *   - on the venue page it was an 11px link at `opacity-70` sitting between the
 *     logo and the venue name, i.e. the only *control* in the navy rail head
 *     and also the faintest thing in it (4.70:1, barely over the 4.5:1 floor).
 *     Tinting it gold was not available — gold on --railhd is 3.65:1.
 *   - on Catalog it shared a baseline with the h1, which pushed the title 66px
 *     off the px-4 gutter that every column head below it starts at.
 *
 * On --card it is --muted-foreground at 5.40:1, and the row gives it a hit area
 * the full width of the rail instead of the width of the words.
 *
 * `className` carries the sticky offset, which is the one thing that differs by
 * screen: the venue page's rail is already sticky as a whole, so the row rides
 * along, while Catalog has to pin it under its own h-13 bar.
 */
export function BackToVenues({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn(`flex shrink-0 items-center gap-1.5 border-b bg-card px-4 py-2.5
                     text-[11px] text-muted-foreground transition-colors
                     hover:bg-muted hover:text-foreground`, className)}
    >
      <ChevronLeftIcon className="size-3.5" aria-hidden />
      All venues
    </Link>
  )
}
