import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Warning } from '@/calculator/types'
import { WarningsPanel } from './WarningsPanel'

const warn = (n: number): Warning =>
  ({ code: `W${n}`, level: 'warn', message: `warning number ${n}` })

const many = (n: number) => Array.from({ length: n }, (_, i) => warn(i + 1))

describe('WarningsPanel', () => {
  // A stock Pro venue emits exactly two checks (POE_BUDGET and
  // ACCESS_POINTS_MANUAL). It is the common case, it already fits the rail,
  // and it must not grow a control that reveals nothing.
  it('leaves two checks alone — no control, no count', () => {
    render(<WarningsPanel warnings={many(2)} />)
    expect(screen.getByText('warning number 1')).toBeInTheDocument()
    expect(screen.getByText('warning number 2')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  // Past two, the rail is taller than the viewport and the inputs above it
  // scroll out of reach. Only the first two survive; the button has to say
  // how many it is holding back, or the count is a mystery.
  it('shows two of six and offers the other four', () => {
    render(<WarningsPanel warnings={many(6)} />)
    expect(screen.getByText('warning number 2')).toBeInTheDocument()
    expect(screen.queryByText('warning number 3')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /show 4 more/i })).toBeInTheDocument()
  })

  it('reveals the rest when expanded, and folds them away again', () => {
    render(<WarningsPanel warnings={many(6)} />)
    fireEvent.click(screen.getByRole('button', { name: /show 4 more/i }))
    expect(screen.getByText('warning number 6')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /show less/i }))
    expect(screen.queryByText('warning number 6')).not.toBeInTheDocument()
  })

  // The reason the sort exists. POE_BUDGET is the only check whose level moves
  // with the venue — it turns critical past 90% of the PoE budget — and the
  // engine emits it midway through the list. Truncating in emission order
  // would hide the one check that means "this venue cannot be wired as spec'd"
  // behind a button labelled `Show 4 more`. Without the sort this test fails
  // and the panel is worse than the wall of text it replaced.
  it('keeps a late critical visible while collapsed', () => {
    const warnings: Warning[] = [
      ...many(3),
      { code: 'POE_BUDGET', level: 'critical', message: 'PoE load 566W of 600W (94%).' },
      ...many(2),
    ]
    render(<WarningsPanel warnings={warnings} />)
    // Presence alone would be free — it has to be one of the two that survive
    // the cut, which is only true if the sort ran.
    const shown = screen.getAllByText(/warning number \d|PoE load/)
    expect(shown).toHaveLength(2)
    expect(shown.map(n => n.textContent))
      .toContain('PoE load 566W of 600W (94%).')
  })

  // Within one level the engine's order is the sizing doc's order, which is
  // the order an installer reads the build in. A sort that reshuffles equals
  // would scramble it for no gain.
  it('preserves emission order among checks of the same level', () => {
    render(<WarningsPanel warnings={many(6)} />)
    fireEvent.click(screen.getByRole('button', { name: /show 4 more/i }))
    const shown = screen.getAllByText(/^warning number /).map(n => n.textContent)
    expect(shown).toEqual([
      'warning number 1', 'warning number 2', 'warning number 3',
      'warning number 4', 'warning number 5', 'warning number 6',
    ])
  })

  // The count is what makes a collapsed panel honest: two checks on screen and
  // a button is not enough to tell you the venue has six things outstanding.
  it('carries the total in the header once it is collapsing', () => {
    const { rerender } = render(<WarningsPanel warnings={many(6)} />)
    expect(screen.getByRole('heading', { name: /checks/i })).toHaveTextContent('6')

    rerender(<WarningsPanel warnings={many(2)} />)
    expect(screen.getByRole('heading', { name: /checks/i })).not.toHaveTextContent('2')
  })

  it('renders nothing at all when the venue is clean', () => {
    const { container } = render(<WarningsPanel warnings={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
