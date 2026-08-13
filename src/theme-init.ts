/**
 * Resolves and applies the theme class before first paint.
 *
 * Extracted from index.html so it is reachable by a test. next-themes handles
 * this via SSR, which a Vite SPA does not have: React mounts after the first
 * paint, so without a synchronous script a dark-mode user sees a white flash on
 * every load. The storage key matches next-themes' default so the two agree.
 *
 * index.html carries a hand-inlined copy of this logic. It is a mirror, not an
 * import — a module would run too late to matter.
 */
export const THEME_STORAGE_KEY = 'theme'

export function applyStoredTheme(
  win: Window,
  root: { classList: DOMTokenList },
): 'light' | 'dark' {
  let stored: string | null = null
  try {
    stored = win.localStorage.getItem(THEME_STORAGE_KEY)
  } catch {
    // Safari in private mode throws on localStorage. Fall through to the OS.
  }
  const resolved =
    stored === 'light' || stored === 'dark'
      ? stored
      : win.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'

  root.classList.toggle('dark', resolved === 'dark')
  return resolved
}
