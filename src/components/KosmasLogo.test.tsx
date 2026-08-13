import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { KosmasLogo } from './KosmasLogo'

describe('KosmasLogo', () => {
  it('exposes an accessible name rather than being decorative', () => {
    render(<KosmasLogo />)
    expect(screen.getByRole('img', { name: 'Kosmas' })).toBeInTheDocument()
  })

  // The source paints via an internal <style> with .st0-.st3 classes. Left
  // alone those leak four generic names into the global document AND ignore the
  // theme, which is what would make the wordmark invisible in one of the modes.
  it('binds its fills to tokens instead of the source stylesheet', () => {
    const { container } = render(<KosmasLogo />)
    const svg = container.querySelector('svg')!
    expect(svg.querySelector('style')).toBeNull()
    expect(svg.innerHTML).not.toContain('st0')
    for (const v of ['--mark', '--word', '--tag', '--tm']) {
      expect(svg.innerHTML).toContain(`var(${v})`)
    }
  })

  // Guards against dropping paths while hand-transcribing four groups out of
  // the source. Counts are from the SVG: 3 / 6 / 3 / 1.
  it('carries every element of the lockup', () => {
    const { container } = render(<KosmasLogo />)
    const groups = container.querySelectorAll('svg > g')
    expect(groups).toHaveLength(4)
    expect([...groups].map(g => g.children.length)).toEqual([3, 6, 3, 1])
  })

  it('crops to the artwork so the lockup has no dead space', () => {
    const { container } = render(<KosmasLogo />)
    expect(container.querySelector('svg')).toHaveAttribute('viewBox', '66 46 648 141')
  })
})
