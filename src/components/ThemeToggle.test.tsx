import { fireEvent, render, screen } from '@testing-library/react'
import { ThemeProvider } from 'next-themes'
import { beforeEach, describe, expect, it } from 'vitest'
import { ThemeToggle } from './ThemeToggle'

function mount() {
  return render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
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
    expect(localStorage.getItem('theme')).toBe('dark')
  })
})
