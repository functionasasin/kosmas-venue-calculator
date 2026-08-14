import { KosmasLogo } from '@/components/KosmasLogo'
import { cn } from '@/lib/utils'

/**
 * The Kosmas band: --railhd ground, gold rule under it, the lockup on top.
 *
 * It started as the venue page's rail head and is now the brand device on every
 * screen, so it lives here rather than being copied four times. `children` is
 * for the venue page, which puts the venue name inside the same block; the
 * other three screens pass nothing.
 *
 * Why no colour handling: every placement puts the lockup on --railhd, which is
 * navy in light and near-black in dark. Both are the "dark solid color
 * background" the brand book specifies the White logo for, so the shipped
 * tokens already paint the approved version and there is nothing to switch. A
 * surface prop was designed for this and then not built, because putting the
 * band on all three screens removed the only case that needed it — a lockup on
 * a white surface, which would have wanted the Color version's blue wordmark.
 *
 * `align` is not decoration. A full-width band gets the lockup on the same px-4
 * gutter as the content below it; a narrow container (the login card, the
 * 232px rail) centres it, because left-aligning inside those leaves an obvious
 * wedge of empty ground to the lockup's right — 51.8px in the rail's case.
 */
export function BrandBlock({
  align = 'left',
  className,
  children,
}: {
  align?: 'left' | 'center'
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'border-b-2 border-gold bg-railhd px-4 py-3 text-railhd-foreground',
        className,
      )}
    >
      <KosmasLogo
        className={cn('h-auto w-[9.2rem]', align === 'center' && 'mx-auto')}
      />
      {children}
    </div>
  )
}
