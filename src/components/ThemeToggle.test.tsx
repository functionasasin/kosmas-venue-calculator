import { fireEvent, render, screen } from '@testing-library/react'
import { ThemeProvider } from 'next-themes'
import { beforeEach, describe, expect, it } from 'vitest'
import { THEME_STORAGE_KEY } from '@/theme-init'
import { ThemeToggle } from './ThemeToggle'

function mount() {
  return render(
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey={THEME_STORAGE_KEY}
    >
      <ThemeToggle />
    </ThemeProvider>,
  )
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
  })

  it('offers to switch to the theme you are not in', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /switch to dark theme/i }))
    expect(document.documentElement).toHaveClass('dark')
  })

  // The whole point of "toggle and remember": a choice has to outlive the tab.
  it('persists the choice so a reload keeps it', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /switch to dark theme/i }))
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })

  // Both tests above start from light and click toward dark, so a hardcoded
  // setTheme('dark') would pass them. Seed a stored preference the way a
  // returning user's browser actually has one, and check the reverse trip.
  it('reverses: a returning dark-mode user can switch back to light', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    mount()
    const toggle = await screen.findByRole('button', { name: /switch to light theme/i })
    fireEvent.click(toggle)
    expect(document.documentElement).not.toHaveClass('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })
})
