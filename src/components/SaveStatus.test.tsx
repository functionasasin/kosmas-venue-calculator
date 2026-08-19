import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SaveStatus, UnsavedStrip } from './SaveStatus'

const AUTHOR = 'mvbasug@kosmas.com.ph'
const AT = '2026-08-19T07:58:00.123456+00:00'

describe('SaveStatus — the toolbar line', () => {
  /**
   * The reason this sits in the toolbar rather than the rail foot it started
   * in. `dirty` was tracked but never rendered: the first and only thing that
   * told you about unsaved edits was the guard dialog fired by leaving.
   *
   * It matters most in the state nothing else marks — after a Recalculate,
   * where the amber dot on that button clears and `dirty` stays true.
   */
  it('announces unsaved edits in the bar, not only at the exit guard', () => {
    render(<SaveStatus dirty updatedByEmail={AUTHOR} updatedAt={AT} />)
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })

  /**
   * The two states take turns rather than stacking. While you are mid-edit the
   * last-saved fact describes a version that is no longer on screen, so showing
   * both would present a stale claim as current.
   */
  it('drops the last-saved claim while it is out of date', () => {
    render(<SaveStatus dirty updatedByEmail={AUTHOR} updatedAt={AT} />)
    expect(screen.queryByText(/Saved by/)).not.toBeInTheDocument()
  })

  /**
   * The bug the whole change was raised for. The original used a bare
   * toLocaleDateString(), which reads the *browser's* locale: the same venue
   * rendered 8/19/2026 on a US-configured machine and 19/8/2026 on a PH one,
   * with no way to tell which you were looking at.
   *
   * en-PH is month-first, so this reads "Aug 19, 2026" and the PDF's long form
   * reads "August 19, 2026". Day-first would be the prettier line, but it would
   * mean the bar and the export describing one venue two ways.
   */
  it('renders a date that cannot be read in two orders', () => {
    render(<SaveStatus dirty={false} updatedByEmail={AUTHOR} updatedAt={AT} />)
    expect(screen.getByText(/Aug 19, 2026/)).toBeInTheDocument()
  })

  /**
   * Venues created before migration 0006 have no recorded author. Rendering
   * "unknown" would state something the row does not say.
   */
  it('shows no author rather than inventing one', () => {
    const { container } = render(
      <SaveStatus dirty={false} updatedByEmail={null} updatedAt={AT} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('still warns about unsaved edits on a venue with no recorded author', () => {
    render(<SaveStatus dirty updatedByEmail={null} updatedAt={AT} />)
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })

  /**
   * The domain is dropped because every address is @kosmas.com.ph and the bar
   * is shared with three buttons, so it is the half carrying no information.
   * Safe only while the full address stays recoverable — if two local parts
   * ever collide, hovering is what tells them apart.
   */
  it('keeps the full address reachable after shortening it', () => {
    render(<SaveStatus dirty={false} updatedByEmail={AUTHOR} updatedAt={AT} />)
    expect(screen.getByText(/mvbasug/)).not.toHaveTextContent('@kosmas.com.ph')
    expect(screen.getByTitle(new RegExp(AUTHOR))).toBeInTheDocument()
  })

  /**
   * The toolbar holds a theme toggle and three buttons and is already near full
   * at 390px. Left in the flow the text wraps the bar to a second row — and the
   * bar is `sticky top-0`, so that row would then follow the user down every
   * scroll of a long materials table, on the screen least able to spare it.
   * UnsavedStrip is what covers mobile instead.
   */
  it('gets out of the way on a phone, where the bar is already full', () => {
    const { container } = render(
      <SaveStatus dirty={false} updatedByEmail={AUTHOR} updatedAt={AT} />,
    )
    expect(container.firstElementChild!.className).toContain('max-sm:hidden')
  })
})

describe('UnsavedStrip — the mobile warning', () => {
  /**
   * Mobile deliberately shows nothing at all when the venue is saved: the bar
   * is `sticky`, so anything permanent here is paid for on every scroll, and
   * "who saved this in August" cannot cost anyone work. Only the state that can
   * is worth the 30px.
   */
  it('costs nothing while there is nothing to warn about', () => {
    const { container } = render(<UnsavedStrip dirty={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('appears the moment there are edits nobody has saved', () => {
    render(<UnsavedStrip dirty />)
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })

  /**
   * It has to travel with the bar it hangs from, or it scrolls away and leaves
   * the warning behind exactly when the user is scrolling through the table
   * they are editing. top-13 is the h-13 bar above it — the same pairing
   * Catalog already uses for its back row.
   */
  it('stays pinned under the bar rather than scrolling away', () => {
    const { container } = render(<UnsavedStrip dirty />)
    const cls = container.firstElementChild!.className
    expect(cls).toContain('sticky')
    expect(cls).toContain('top-13')
  })

  /**
   * The desktop bar already says "Unsaved changes" inline, so showing the strip
   * there too would say it twice on one screen.
   */
  it('yields to the inline line once there is room for it', () => {
    const { container } = render(<UnsavedStrip dirty />)
    expect(container.firstElementChild!.className).toContain('sm:hidden')
  })

  /**
   * Sticky means the materials table scrolls UNDER this, so its ground has to
   * be opaque or the rows read straight through the warning. The obvious class
   * to reach for is the checks panel's bg-attention/10 — correct there, where it
   * sits in normal flow, and wrong here for exactly this reason. It was written
   * that way first and caught in a browser. --decide is the opaque amber band.
   *
   * The h-13 bar above it carries the same note, which is what makes this a
   * rule rather than a one-off.
   */
  it('does not let the table show through the warning', () => {
    const { container } = render(<UnsavedStrip dirty />)
    const cls = container.firstElementChild!.className
    expect(cls).toContain('bg-decide')
    expect(cls).not.toMatch(/bg-\S+\/\d/)
  })
})
