import { describe, expect, it } from 'vitest'
import { contrast, cssVarName, DARK, LIGHT, TOKEN_NAMES, type ThemeTokens } from './theme-tokens'
// `?raw` rather than node:fs — tsconfig.app.json sets types: ["vite/client"]
// and include: ["src"], so a node:fs import fails `tsc -b` even though Vitest
// would run it. This depends on `test.css.include` in vite.config.ts: without
// it, Vitest's css-disable plugin matches `.css?raw` too and stubs this to ''.
import indexCss from '../index.css?raw'

// Floors as explicit (foreground, background) pairs. 4.5:1 wherever the text is
// small — the rail's 10px uppercase labels, the 11px checks, the 12px formula
// column. 3:1 for marks and control boundaries, per WCAG 1.4.11.
const SMALL_TEXT: [keyof ThemeTokens, keyof ThemeTokens][] = [
  ['foreground', 'card'],
  ['mutedForeground', 'card'],
  ['mutedForeground', 'muted'],
  ['brand', 'muted'],
  ['attentionForeground', 'card'],
  ['critical', 'card'],
  ['destructive', 'card'],
  ['primaryForeground', 'primary'],
]

const MARKS: [keyof ThemeTokens, keyof ThemeTokens][] = [
  ['ring', 'card'],
  ['brand', 'card'],
  ['gold', 'railhd'],
  ['word', 'railhd'],
]

describe.each([['light', LIGHT], ['dark', DARK]] as const)('%s palette', (_name, pal) => {
  it.each(SMALL_TEXT)('%s on %s carries small text at 4.5:1', (fg, bg) => {
    expect(contrast(pal[fg], pal[bg])).toBeGreaterThanOrEqual(4.5)
  })

  it.each(MARKS)('%s on %s is distinguishable at 3:1', (fg, bg) => {
    expect(contrast(pal[fg], pal[bg])).toBeGreaterThanOrEqual(3)
  })
})

// The mark is 1.68:1 on the navy header and ships that way on purpose: WCAG
// exempts logotypes and the approved previews show a red runner. This test is
// here so raising it later is a deliberate act with a failing test attached,
// rather than a silent "accessibility fix" that changes the brand.
it('keeps the logo mark red even where it is low contrast', () => {
  expect(LIGHT.mark).toBe('#E31F26')
  expect(DARK.mark).toBe('#E31F26')
  expect(contrast(LIGHT.mark, LIGHT.railhd)).toBeLessThan(3)
})

// A token defined in only one mode silently falls back to the other mode's
// value, which is invisible until someone looks at the wrong theme.
it('defines identical token sets in both modes', () => {
  expect(Object.keys(DARK).sort()).toEqual(Object.keys(LIGHT).sort())
})

/**
 * Extracts a marker-delimited token block.
 *
 * Marker comments rather than selector matching: the first '.dark' in the file
 * is `@custom-variant dark (&:is(.dark *))` on line 6, so searching for the
 * selector finds the custom-variant line and parses the wrong block entirely.
 */
function tokenBlock(css: string, mode: 'light' | 'dark'): Record<string, string> {
  const open = `/* theme:${mode} */`
  const close = `/* /theme:${mode} */`
  const start = css.indexOf(open)
  const end = css.indexOf(close)
  if (start === -1 || end === -1) throw new Error(`no ${open} … ${close} markers in index.css`)
  const out: Record<string, string> = {}
  for (const line of css.slice(start + open.length, end).split('\n')) {
    const m = /^\s*(--[a-z-]+)\s*:\s*(.+?);/.exec(line)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

describe('index.css', () => {
  it.each([['light', LIGHT], ['dark', DARK]] as const)(
    '%s block declares every token at the audited value',
    (mode, pal) => {
      const declared = tokenBlock(indexCss, mode)
      for (const token of TOKEN_NAMES) {
        expect(declared[cssVarName(token)]).toBe(pal[token])
      }
    },
  )

  // The block overrode --border, which @layer base applies to every element via
  // `* { @apply border-border }`. It made an OS-dark user see near-black borders
  // on this light-only app, and it would have overridden an explicit Light
  // choice too — a media query does not care what class is on <html>.
  it('has no prefers-color-scheme block left to fight the theme class', () => {
    expect(indexCss).not.toContain('prefers-color-scheme')
  })

  // Unlayered `:root { font: … var(--sans) }` beats the layered
  // `html { @apply font-sans }`, so this line is what picks the app's typeface.
  // Repointing it at --font-sans would silently switch every screen to Geist.
  it('leaves the typeface alone', () => {
    expect(indexCss).toContain('--sans: system-ui')
    expect(indexCss).toContain('font: 18px/145% var(--sans);')
  })
})
