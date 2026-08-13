import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { MoonIcon, SunIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Light/dark switch. State lives in next-themes, which was already a dependency
 * — src/components/ui/sonner.tsx has always called useTheme() with no provider
 * mounted, so toasts followed the OS regardless of any choice. Mounting the
 * provider in App.tsx fixes that as a side effect.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  // next-themes resolves on the client, after mount. Rendering a concrete
  // label before then can name the wrong direction and swap a frame later, so
  // hold a neutral one for the first tick.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const dark = resolvedTheme === 'dark'
  const next = dark ? 'light' : 'dark'

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-auto px-[.55rem] py-[.25rem] text-[11px]"
      aria-label={mounted ? `Switch to ${next} theme` : 'Switch theme'}
      onClick={() => setTheme(next)}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </Button>
  )
}
