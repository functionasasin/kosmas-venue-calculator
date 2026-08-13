/**
 * Every colour in the app, in one place.
 *
 * A TS module rather than the CSS itself because the contrast suite has to read
 * the real values: Vitest runs with CSS stubbed (vite.config.ts sets no
 * `test.css`), so getComputedStyle would return ''. `index.css` declares the
 * same values between marker comments and theme-tokens.test.ts asserts the two
 * agree, so this table is what ships rather than a parallel copy of it.
 *
 * Palette source: ~/Desktop/KOSMAS-LOGO.svg — wordmark #005490, mark #e31f26,
 * tagline #d2ab67, TM #194f81.
 */

export interface ThemeTokens {
  // shadcn roles, consumed by src/components/ui/*.
  background: string
  foreground: string
  card: string
  cardForeground: string
  popover: string
  popoverForeground: string
  primary: string
  primaryForeground: string
  primaryHover: string
  secondary: string
  secondaryForeground: string
  muted: string
  mutedForeground: string
  accent: string
  accentForeground: string
  destructive: string
  border: string
  input: string
  ring: string
  // Roles shadcn has no slot for.
  brand: string
  brandForeground: string
  railhd: string
  railhdForeground: string
  railhdRing: string
  gold: string
  attention: string
  attentionForeground: string
  critical: string
  scrim: string
  // Logo fills.
  mark: string
  word: string
  tag: string
  tm: string
}

export const LIGHT: ThemeTokens = {
  background: '#F1F2F4',
  foreground: '#12151A',
  card: '#FFFFFF',
  cardForeground: '#12151A',
  popover: '#FFFFFF',
  popoverForeground: '#12151A',
  // The commit red. shadcn's default <Button> is bg-primary and Save is a
  // default Button, so primary is red, not navy. Navy is `brand`.
  primary: '#E31F26',
  primaryForeground: '#FFFFFF',
  // Darker, not bg-primary/80. The stock hover thinned the fill until the
  // white label sat at 3.75:1; the near-black stock primary got away with it,
  // the brand red does not.
  primaryHover: '#C81A20',
  // shadcn's muted button surface, NOT "the second brand colour".
  secondary: '#F1F2F4',
  secondaryForeground: '#12151A',
  muted: '#F1F2F4',
  mutedForeground: '#636B75',
  accent: '#EAF1F7',
  accentForeground: '#005490',
  // Darkened from the brand red so 11px check text clears 4.5:1. Always renders
  // as a tint (button.tsx uses bg-destructive/10 text-destructive), never as a
  // solid fill — which is what keeps it distinct from the red commit button.
  // The tint is its own background, so the hover alpha is capped at /16: the
  // stock /20 put the label at 4.33:1 on the very surface it sits on.
  destructive: '#C2101A',
  border: '#E6E8EC',
  input: '#DCDFE4',
  ring: '#005490',
  brand: '#005490',
  brandForeground: '#FFFFFF',
  railhd: '#005490',
  railhdForeground: '#FFFFFF',
  // The rail header is the one block where --ring is invisible: it is #005490
  // on #005490, 1.00:1, and the `← Venues` link is the only focusable thing on
  // it. Gold rather than white so the ring echoes the rule under the header.
  railhdRing: '#D2AB67',
  gold: '#D2AB67',
  attention: '#F0B100',
  // Darkened from #A65F00 (2026-08-13 review): the "needs a decision" band is
  // bg-attention/20 composited over --card, not --attention itself, and this
  // token was only ever checked against solid --card. #A65F00 clears --card at
  // 5.57:1 but the actual composited band (#FCEFCC) only reaches 4.31:1 —
  // under the 4.5:1 floor. #9A5800 is the minimal darkening that clears both:
  // 4.88:1 on the composited band, 5.57:1 on --card.
  attentionForeground: '#9A5800',
  critical: '#C2410C',
  scrim: 'rgba(0,0,0,.10)',
  mark: '#E31F26',
  word: '#FFFFFF',
  tag: '#E8C98C',
  tm: '#CDDCED',
}

export const DARK: ThemeTokens = {
  background: '#121212',
  foreground: '#E8E9EA',
  card: '#121212',
  cardForeground: '#E8E9EA',
  popover: '#1C1D20',
  popoverForeground: '#E8E9EA',
  primary: '#DB5A5F',
  primaryForeground: '#1A0B0C',
  primaryHover: '#E4767A',
  secondary: '#1C1D20',
  secondaryForeground: '#E8E9EA',
  muted: '#1C1D20',
  mutedForeground: '#9BA1AA',
  accent: '#16242E',
  accentForeground: '#3AA4EF',
  // Lightened from #F2555B. The destructive button paints this colour as text
  // on a tint of *itself*, so in dark the two luminances converge: #F2555B on
  // its own /20 tint over --popover was 3.87:1 at rest and 3.29:1 hovered, and
  // no alpha fixes it — thinning the tint to clear 4.5:1 leaves no fill to
  // hover. Lifting the text is the only knob. Also lifts the check text and the
  // warning rule, and pulls further away from --primary #DB5A5F.
  destructive: '#FF8A8E',
  border: '#2A2B2F',
  input: '#33353A',
  ring: '#3AA4EF',
  brand: '#3AA4EF',
  brandForeground: '#07161F',
  // Surface grey, not navy. Mid-navy on near-black is muddy at any size; after
  // dark the brand carries through the reversed wordmark and the gold rule.
  railhd: '#1C1D20',
  railhdForeground: '#E8E9EA',
  // Dark's rail header is surface grey, so --ring already reads on it at
  // 6.21:1. Same value, held as its own token so light can differ.
  railhdRing: '#3AA4EF',
  gold: '#D2AB67',
  attention: '#F0B100',
  attentionForeground: '#F0B100',
  critical: '#FF6900',
  scrim: 'rgba(0,0,0,.55)',
  mark: '#E31F26',
  word: '#FFFFFF',
  tag: '#D2AB67',
  tm: '#B9C9DA',
}

export const TOKEN_NAMES = Object.keys(LIGHT) as (keyof ThemeTokens)[]

/** railhdForeground -> --railhd-foreground */
export function cssVarName(token: keyof ThemeTokens): string {
  return '--' + String(token).replace(/[A-Z]/g, c => '-' + c.toLowerCase())
}

function channel(v: number): number {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) throw new Error(`luminance() needs a 6-digit hex, got ${hex}`)
  const n = parseInt(m[1], 16)
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  )
}

/** WCAG 2.x relative-luminance contrast ratio, 1..21. Hex only — `scrim` is
 *  rgba() and is deliberately in no audited pair. */
export function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/**
 * Alpha-composites `fg` at `alphaPct`% over the opaque `bg`, returning a solid
 * hex. Exists because `contrast()` takes solid hex only, but utilities like
 * `bg-attention/20` never paint a flat colour — they lay `fg` translucent over
 * whatever surface is beneath, and text sitting on that band is judged against
 * the *composited* result, not against `fg` or `bg` alone. Tailwind's opacity
 * modifier compiles to a `color-mix(..., transparent)` that reduces
 * algebraically to a plain sRGB alpha blend, so a straight per-channel blend
 * here reproduces the exact colour the browser paints.
 */
export function compositeOver(fg: string, bg: string, alphaPct: number): string {
  const mf = /^#([0-9a-f]{6})$/i.exec(fg.trim())
  const mb = /^#([0-9a-f]{6})$/i.exec(bg.trim())
  if (!mf || !mb) throw new Error(`compositeOver() needs 6-digit hex, got ${fg} / ${bg}`)
  const nf = parseInt(mf[1], 16)
  const nb = parseInt(mb[1], 16)
  const a = alphaPct / 100
  const blend = (shift: number) =>
    Math.round(a * ((nf >> shift) & 255) + (1 - a) * ((nb >> shift) & 255))
  const r = blend(16)
  const g = blend(8)
  const b = blend(0)
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('').toUpperCase()
}
