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

  // resolvedTheme is already correct on first render (next-themes computes it
  // in a lazy useState initialiser), so this isn't guarding against a known
  // flash. It's a cheap belt-and-braces safeguard against ever naming the
  // wrong direction before the provider has mounted.
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
