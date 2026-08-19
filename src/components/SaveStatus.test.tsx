import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SaveStatus } from './SaveStatus'

const AUTHOR = 'mvbasug@kosmas.com.ph'
const AT = '2026-08-19T07:58:00.123456+00:00'

describe('SaveStatus', () => {
  /**
   * The reason this strip exists rather than being a prettier version of the
   * old rail-head line. `dirty` was tracked but never rendered: the first and
   * only thing that told you about unsaved edits was the guard dialog fired by
   * leaving, so the state was invisible for as long as you stayed on the page.
   *
   * It matters most in the state nothing else marks — after a Recalculate,
   * where the amber dot on that button clears and `dirty` stays true.
   */
  it('announces unsaved edits in the rail, not only at the exit guard', () => {
    render(<SaveStatus dirty updatedByEmail={AUTHOR} updatedAt={AT} />)
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })

  /**
   * One line at 232px, so the two states take turns. While you are mid-edit the
   * last-saved fact describes a version that is no longer what is on screen —
   * showing both would present a stale claim as current.
   */
  it('drops the last-saved claim while it is out of date', () => {
    render(<SaveStatus dirty updatedByEmail={AUTHOR} updatedAt={AT} />)
    expect(screen.queryByText(/Saved by/)).not.toBeInTheDocument()
  })

  /**
   * The bug this whole change was raised for. The old line used a bare
   * toLocaleDateString(), which reads the *browser's* locale: the same venue
   * rendered 8/19/2026 on a US-configured machine and 19/8/2026 on a PH one,
   * with no way to tell which you were looking at. Month names cannot be
   * ambiguous, and en-PH is pinned to match exportMaterials.ts, so the rail and
   * the exported PDF cannot disagree about the same venue.
   *
   * Note the order: en-PH is month-first, so this reads "Aug 19, 2026" and the
   * PDF's long form reads "August 19, 2026". Day-first would have been the
   * prettier line in a narrow rail, but it would mean the rail and the PDF
   * printing the same venue two different ways, which is the argument this
   * component was making in the first place.
   */
  it('renders a date that cannot be read in two orders', () => {
    render(<SaveStatus dirty={false} updatedByEmail={AUTHOR} updatedAt={AT} />)
    expect(screen.getByText(/Aug 19, 2026/)).toBeInTheDocument()
  })

  /**
   * Venues created before migration 0006 have no recorded author. Rendering
   * "unknown" would state something the row does not say; an absent line is the
   * honest reading. Carried over from the rail-head version deliberately.
   */
  it('shows no author rather than inventing one', () => {
    const { container } = render(
      <SaveStatus dirty={false} updatedByEmail={null} updatedAt={AT} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  /**
   * ...but an unsaved venue still has to say so. The author is what is missing
   * on those rows, not the save state.
   */
  it('still warns about unsaved edits on a venue with no recorded author', () => {
    render(<SaveStatus dirty updatedByEmail={null} updatedAt={AT} />)
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })

  /**
   * The domain is dropped because every address is @kosmas.com.ph and the rail
   * is 232px, so it is the half that carries no information. That is only safe
   * while the full address stays recoverable — if two local parts ever collide,
   * hovering is what tells them apart.
   */
  it('keeps the full address reachable after shortening it', () => {
    render(<SaveStatus dirty={false} updatedByEmail={AUTHOR} updatedAt={AT} />)
    expect(screen.getByText(/mvbasug/)).not.toHaveTextContent('@kosmas.com.ph')
    expect(screen.getByTitle(new RegExp(AUTHOR))).toBeInTheDocument()
  })

  /**
   * The placement decision, encoded rather than described. The point of moving
   * this out of the rail head is that --muted-foreground is a grey mixed for
   * white surfaces: on --card it is 5.40:1, and on the band's navy --railhd it
   * was 1.46:1 — under even the 3:1 large-text floor. A future tidy-up that
   * moves the strip back into BrandBlock re-creates exactly that, so the ground
   * it depends on is pinned here the way BrandBlock pins its own.
   */
  it('sits on the light surface its grey was mixed for', () => {
    const { container } = render(
      <SaveStatus dirty={false} updatedByEmail={AUTHOR} updatedAt={AT} />,
    )
    const strip = container.firstElementChild!
    expect(strip.className).toContain('text-muted-foreground')
    expect(strip.className).not.toContain('bg-railhd')
  })
})
