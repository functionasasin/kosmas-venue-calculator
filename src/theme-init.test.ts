import { beforeEach, describe, expect, it } from 'vitest'
import { applyStoredTheme, THEME_STORAGE_KEY } from './theme-init'

function fakeWindow(stored: string | null, prefersDark: boolean) {
  return {
    localStorage: { getItem: (k: string) => (k === THEME_STORAGE_KEY ? stored : null) },
    matchMedia: (q: string) => ({ matches: prefersDark && q.includes('dark') }),
  } as unknown as Window
}

describe('applyStoredTheme', () => {
  let root: HTMLElement

  beforeEach(() => {
    root = document.createElement('html')
  })

  it('uses the OS preference when nothing is stored', () => {
    expect(applyStoredTheme(fakeWindow(null, true), root)).toBe('dark')
    expect(root.classList.contains('dark')).toBe(true)
  })

  // The regression this whole change is most likely to reintroduce. The old
  // @media (prefers-color-scheme: dark) block overrode --border regardless of
  // any class, so a dark-OS user could not get a light app at all.
  it('honours an explicit light choice on a dark OS', () => {
    expect(applyStoredTheme(fakeWindow('light', true), root)).toBe('light')
    expect(root.classList.contains('dark')).toBe(false)
  })

  it('honours an explicit dark choice on a light OS', () => {
    expect(applyStoredTheme(fakeWindow('dark', false), root)).toBe('dark')
    expect(root.classList.contains('dark')).toBe(true)
  })

  // A value from a future release, or a hand-edited one, must not leave the
  // page unstyled — it falls back rather than applying a bogus class.
  it('falls back to the OS when the stored value is not a theme', () => {
    expect(applyStoredTheme(fakeWindow('chartreuse', true), root)).toBe('dark')
  })

  it('removes a stale dark class when switching back to light', () => {
    root.classList.add('dark')
    applyStoredTheme(fakeWindow('light', false), root)
    expect(root.classList.contains('dark')).toBe(false)
  })
})
