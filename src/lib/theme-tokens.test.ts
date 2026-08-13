import { describe, expect, it } from 'vitest'
import { contrast, DARK, LIGHT, type ThemeTokens } from './theme-tokens'

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
