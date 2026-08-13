import { describe, expect, it } from 'vitest'
import { compositeOver, contrast, cssVarName, DARK, LIGHT, TOKEN_NAMES, type ThemeTokens } from './theme-tokens'
// `?raw` rather than node:fs — tsconfig.app.json sets types: ["vite/client"]
// and include: ["src"], so a node:fs import fails `tsc -b` even though Vitest
// would run it. This depends on `test.css.include` in vite.config.ts: without
// it, Vitest's css-disable plugin matches `.css?raw` too and stubs this to ''.
import indexCss from '../index.css?raw'
// Same reason as above: ?raw, never node:fs — tsconfig has no node types.
import appSource from '../App.tsx?raw'
// The composited audits below model a specific stack of tints. These three are
// read back so the numbers stay tied to the utilities that actually paint them.
import tableSource from '../components/ui/table.tsx?raw'
import buttonSource from '../components/ui/button.tsx?raw'
import sectionSource from '../components/MaterialsSection.tsx?raw'

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
  // The hover fill, not just the resting one. bg-primary/80 put the label at
  // 3.75:1 under the cursor on every commit button in the app.
  ['primaryForeground', 'primaryHover'],
]

const MARKS: [keyof ThemeTokens, keyof ThemeTokens][] = [
  ['ring', 'card'],
  ['brand', 'card'],
  ['gold', 'railhd'],
  ['word', 'railhd'],
  // --ring is --brand and so is --railhd in light: the focus ring on the rail
  // header's `← Venues` link was navy on navy, 1.00:1, and there is nothing
  // else focusable on that block to notice it by.
  ['railhdRing', 'railhd'],
]

describe.each([['light', LIGHT], ['dark', DARK]] as const)('%s palette', (_name, pal) => {
  it.each(SMALL_TEXT)('%s on %s carries small text at 4.5:1', (fg, bg) => {
    expect(contrast(pal[fg], pal[bg])).toBeGreaterThanOrEqual(4.5)
  })

  it.each(MARKS)('%s on %s is distinguishable at 3:1', (fg, bg) => {
    expect(contrast(pal[fg], pal[bg])).toBeGreaterThanOrEqual(3)
  })
})

/**
 * The "needs a decision" band is a translucent attention tint over --card, not
 * a solid attention fill, and it carries two texts at different weights: the
 * section label in --attention-foreground and the "resolve before ordering"
 * caption in the dimmer --muted-foreground. No solid pair above describes that
 * surface, and checking attentionForeground against solid --card once let a
 * band that fails AA ship unnoticed.
 *
 * Both states, because hover deepens the tint and spends contrast: the caption
 * is the tighter of the two texts and is what caps the light hover at /26.
 *
 * The backdrop is --card and only --card. It was card → muted/50 → attention/20
 * while TableRow carried `has-aria-expanded:bg-muted/50` and sections start
 * open, which put the caption at 4.31:1 — invisible to a test that models one
 * blend. The guard below is what keeps that third layer from returning.
 */
describe.each([
  ['light', LIGHT, 20, 26],
  ['dark', DARK, 14, 20],
] as const)('the decide band (%s)', (_name, pal, rest, hover) => {
  it.each([
    ['label at rest', 'attentionForeground', rest],
    ['label hovered', 'attentionForeground', hover],
    ['caption at rest', 'mutedForeground', rest],
    ['caption hovered', 'mutedForeground', hover],
  ] as const)('carries its %s at 4.5:1', (_which, token, alphaPct) => {
    const band = compositeOver(pal.attention, pal.card, alphaPct)
    expect(contrast(pal[token], band)).toBeGreaterThanOrEqual(4.5)
  })
})

it('paints the decide band at the alphas audited above', () => {
  expect(sectionSource).toContain('bg-attention/20')
  expect(sectionSource).toContain('hover:bg-attention/26')
  expect(sectionSource).toContain('dark:bg-attention/14')
  expect(sectionSource).toContain('dark:hover:bg-attention/20')
})

it('keeps a row tint from compositing under the decide band', () => {
  expect(tableSource).not.toMatch(/has-aria-expanded:bg-/)
})

/**
 * The destructive button is --destructive text on a tint of --destructive —
 * the label and its own background move together, so every step of alpha costs
 * the text contrast it cannot spare. The `destructive`-on-`card` pair above
 * describes MaterialsRow's check text, not this button, which only ever appears
 * inside a Dialog and so sits on --popover.
 *
 * --popover is also the worse of the two surfaces: in light it is the same white
 * as --card, and in dark it is *lighter* than --card, so a tint over it lands
 * closer to the text. Passing here passes on a card.
 */
describe.each([
  ['light', LIGHT, 10, 16],
  ['dark', DARK, 16, 24],
] as const)('the destructive button (%s)', (_name, pal, rest, hover) => {
  it.each([['at rest', rest], ['hovered', hover]] as const)(
    'carries its label at 4.5:1 %s',
    (_which, alphaPct) => {
      const fill = compositeOver(pal.destructive, pal.popover, alphaPct)
      expect(contrast(pal.destructive, fill)).toBeGreaterThanOrEqual(4.5)
    },
  )
})

it('fills the destructive button at the alphas audited above', () => {
  expect(buttonSource).toContain('bg-destructive/10')
  expect(buttonSource).toContain('hover:bg-destructive/16')
  expect(buttonSource).toContain('dark:bg-destructive/16')
  expect(buttonSource).toContain('dark:hover:bg-destructive/24')
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

/**
 * next-themes is what makes the toggle work and what gives the Toaster a theme.
 * Nothing rendered <App/> in the suite, so the wrapper could be deleted with all
 * tests still green while the toggle went inert — verified by doing exactly that.
 *
 * This reads the source as text rather than mounting App, which would drag in
 * Supabase and the router for a one-line assertion. It cannot prove the provider
 * works; it only fails when the wrapper or its configuration goes missing, which
 * is the regression that actually happened.
 */
describe('App', () => {
  it('mounts the theme provider', () => {
    expect(appSource).toContain('<ThemeProvider')
  })

  it('configures it to agree with the pre-paint script', () => {
    expect(appSource).toContain('attribute="class"')
    expect(appSource).toContain('storageKey={THEME_STORAGE_KEY}')
  })
})
