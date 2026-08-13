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
  destructive: '#C2101A',
  border: '#E6E8EC',
  input: '#DCDFE4',
  ring: '#005490',
  brand: '#005490',
  brandForeground: '#FFFFFF',
  railhd: '#005490',
  railhdForeground: '#FFFFFF',
  gold: '#D2AB67',
  attention: '#F0B100',
  attentionForeground: '#A65F00',
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
  secondary: '#1C1D20',
  secondaryForeground: '#E8E9EA',
  muted: '#1C1D20',
  mutedForeground: '#9BA1AA',
  accent: '#16242E',
  accentForeground: '#3AA4EF',
  destructive: '#F2555B',
  border: '#2A2B2F',
  input: '#33353A',
  ring: '#3AA4EF',
  brand: '#3AA4EF',
  brandForeground: '#07161F',
  // Surface grey, not navy. Mid-navy on near-black is muddy at any size; after
  // dark the brand carries through the reversed wordmark and the gold rule.
  railhd: '#1C1D20',
  railhdForeground: '#E8E9EA',
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
