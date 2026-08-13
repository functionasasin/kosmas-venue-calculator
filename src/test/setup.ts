// Registers the jest-dom matchers (toBeInTheDocument, toBeDisabled, …) on
// Vitest's expect. Referenced from vite.config.ts as a setupFile.
import '@testing-library/jest-dom/vitest'

// jsdom ships no matchMedia. next-themes reads it on mount and the pre-paint
// script falls back to it, so without this every theme test throws before it
// can assert anything. Defaults to light; tests needing dark pass their own.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}
