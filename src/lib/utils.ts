import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * The app's small-caps label, used by every table column head and by the venue
 * rail's field labels. Written out twelve times before this const existed —
 * long enough that a drifting copy would not have been noticed, and the reason
 * `VenueInputsForm` had already localised its own copy as `lb`.
 *
 * A class string rather than a component: three of its users are `<TableHead>`
 * and one is a `<Label>`, so there is no single element to wrap. Callers
 * compose it with their own layout classes (`h-7`, `pl-4`, a width), which is
 * what actually differs between them.
 */
export const microLabel =
  'text-[10px] font-medium uppercase tracking-[.04em] text-muted-foreground'
