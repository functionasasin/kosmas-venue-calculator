import { describe, expect, it } from 'vitest'
import { compositeOver, contrast, DARK, LIGHT, type ThemeTokens } from './theme-tokens'
// `?raw` rather than node:fs — tsconfig.app.json sets types: ["vite/client"]
// and include: ["src"], so a node:fs import fails `tsc -b` even though Vitest
// would run it. This depends on `test.css.include` in vite.config.ts: without
// it, Vitest's css-disable plugin matches `.css?raw` too and stubs this to ''.
import indexCss from '../index.css?raw'
// Same reason as above: ?raw, never node:fs — tsconfig has no node types.
import appSource from '../App.tsx?raw'
// The destructive button's fill is a Tailwind alpha modifier, so its audited
// percentages live in a class string rather than a token. Read back so the
// numbers below stay tied to the utility that actually paints them.
import buttonSource from '../components/ui/button.tsx?raw'

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
  // The "needs a decision" band, both states, and both texts that sit on it:
  // the section label in --attention-foreground and the dimmer "resolve before
  // ordering" caption in --muted-foreground. The caption is the binding one
  // (4.55:1 hovered vs the label's 4.70:1), and checking attentionForeground
  // against solid --card alone once let a band that fails AA ship unnoticed.
  ['attentionForeground', 'decide'],
  ['attentionForeground', 'decideHover'],
  ['mutedForeground', 'decide'],
  ['mutedForeground', 'decideHover'],
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
 * The destructive button is --destructive text on a tint of --destructive — the
 * label and its own background move together, so every step of alpha costs the
 * text contrast it cannot spare. The `destructive`-on-`card` pair above
 * describes MaterialsRow's check text, not this button.
 *
 * It keeps an alpha where the decide band got a solid token, and the difference
 * is the backdrop: this button renders on --popover inside a Dialog but would
 * sit on --card anywhere else, and only a tint adapts to both. --popover is the
 * worse of the two — in light it is the same white as --card, in dark it is
 * *lighter* — so passing here passes on a card.
 *
 * The percentages are read out of the class strings rather than restated, so
 * each one exists exactly once, in the same literal the component paints with.
 */
const DESTRUCTIVE_FILL = [
  ['light', LIGHT, ['bg-destructive/10', 'hover:bg-destructive/16']],
  ['dark', DARK, ['dark:bg-destructive/16', 'dark:hover:bg-destructive/24']],
] as const

describe.each(DESTRUCTIVE_FILL)('the destructive button (%s)', (_name, pal, classes) => {
  it.each(classes)('carries its label at 4.5:1 on %s', cls => {
    const fill = compositeOver(pal.destructive, pal.popover, Number(cls.split('/').pop()))
    expect(contrast(pal.destructive, fill)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(classes)('actually paints %s', cls => {
    expect(buttonSource).toContain(cls)
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

/**
 * The brand book names exactly three logo colours — red #E31F26, blue #005490,
 * gold #D2AB67 (p7) — and p4 permits "no other colors or alterations". The
 * tagline is the gold one.
 *
 * Light carried #E8C98C until 2026-08-14: gold lightened to sit on the navy
 * rail head. That reads as a contrast fix but it is a fourth logo colour, which
 * the book does not allow — and it was never needed, since --gold is already
 * #D2AB67 and MARKS proves that exact pair clears 3:1 on --railhd. Both modes
 * now carry the book's value, which is what dark always had.
 */
it('paints the tagline the brand book gold in both modes', () => {
  expect(LIGHT.tag).toBe('#D2AB67')
  expect(DARK.tag).toBe('#D2AB67')
  expect(LIGHT.tag).toBe(LIGHT.gold)
})

/**
 * Same rule, the other drifted element. --tm carried #CDDCED / #B9C9DA until
 * 2026-08-14 — pale blue-greys belonging to no approved version.
 *
 * The lockup sits only on --railhd today, in both modes, so the White logo
 * applies and the ™ is white like the wordmark. It stays a token of its own
 * rather than folding into --word because the Color version paints it #194F81,
 * which is what putting the lockup on a white surface would need.
 *
 * Four pixels wide at the shipped size, so no one would have caught this by
 * eye. That is the argument for a test rather than against the fix.
 */
it('paints the ™ the same white as the wordmark on the rail head', () => {
  expect(LIGHT.tm).toBe('#FFFFFF')
  expect(DARK.tm).toBe('#FFFFFF')
  expect(LIGHT.tm).toBe(LIGHT.word)
  expect(DARK.tm).toBe(DARK.word)
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
/** railhdForeground -> --railhd-foreground */
function cssVarName(token: keyof ThemeTokens): string {
  return '--' + String(token).replace(/[A-Z]/g, c => '-' + c.toLowerCase())
}

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
      for (const token of Object.keys(LIGHT) as (keyof ThemeTokens)[]) {
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
    expect(indexCss).toContain('font-family: var(--sans);')
  })

  /**
   * The scaffold's `font: 18px/145% var(--sans)` set two things nobody chose.
   *
   * The size made rem 18px, so every Tailwind spacing and type step resolved
   * 12.5% larger than the mockups were drawn at. The leading was worse: a
   * percentage line-height computes to an absolute length at the element that
   * declares it — 26.1px — and it is that length which inherits, not the ratio.
   * Tailwind's arbitrary font-size utilities set font-size and no line-height,
   * so all 28 text-[10px]/text-[11px] labels sat in a 26.1px line box.
   *
   * Removed 2026-08-14. This fails if either half comes back — as a shorthand
   * with a size, or as a bare root font-size. Comments are stripped first: the
   * block above quotes the declaration it is warning about, and matching raw
   * text would fail on the explanation rather than on the CSS.
   */
  it('declares no root font-size or leading', () => {
    const root = indexCss
      .slice(indexCss.indexOf(':root {'), indexCss.indexOf('/* theme:light */'))
      .replace(/\/\*[\s\S]*?\*\//g, '')
    expect(root).not.toMatch(/(^|[^-])font:\s*\d/)
    expect(root).not.toMatch(/font-size:/)
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
