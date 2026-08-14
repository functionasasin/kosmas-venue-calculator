import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BrandBlock } from './BrandBlock'

describe('BrandBlock', () => {
  it('carries the lockup on every screen that renders it', () => {
    render(<BrandBlock />)
    expect(screen.getByRole('img', { name: 'Kosmas' })).toBeInTheDocument()
  })

  /**
   * The load-bearing one. --word is #FFFFFF in BOTH themes because the lockup
   * has only ever sat on --railhd, so this band's ground is the only reason the
   * wordmark is visible at all. Swap bg-railhd for bg-card and the wordmark
   * paints white on white in light mode — invisible, and invisible in a way
   * that reads as a missing asset rather than a colour bug.
   *
   * That exact mistake was made twice while prototyping these placements, both
   * times by building the band without its ground. The gold rule is pinned with
   * it because the two together are the device.
   */
  it('keeps the dark ground the White logo depends on', () => {
    const { container } = render(<BrandBlock />)
    const block = container.firstElementChild!
    expect(block.className).toContain('bg-railhd')
    expect(block.className).toContain('border-gold')
  })

  /**
   * Encodes the placement decision rather than the CSS: a full-width band puts
   * the lockup on the same gutter as the content under it, while a narrow
   * container centres it. Left-aligning in the 232px rail left 51.8px of empty
   * ground to the lockup's right, which is what made it look shoved aside.
   */
  it('centres the lockup only where it was asked to', () => {
    const { container: left } = render(<BrandBlock />)
    expect(left.querySelector('svg')!.getAttribute('class')).not.toContain('mx-auto')

    const { container: centre } = render(<BrandBlock align="center" />)
    expect(centre.querySelector('svg')!.getAttribute('class')).toContain('mx-auto')
  })

  // The venue page puts the venue name inside the same block; the other three
  // screens pass nothing, so children has to be genuinely optional.
  it('renders children inside the band for the venue page', () => {
    render(<BrandBlock align="center"><h1>Tela Park BGC</h1></BrandBlock>)
    const heading = screen.getByRole('heading', { name: 'Tela Park BGC' })
    expect(heading.closest('div')!.className).toContain('bg-railhd')
  })
})
