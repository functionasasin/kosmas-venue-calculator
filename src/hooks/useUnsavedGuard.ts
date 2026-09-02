import { useEffect, useRef } from 'react'

/**
 * The browser-level half of the unsaved-changes guard: tab close and reload.
 * The in-app exit is BackToVenues' onIntercept, which is a dialog and stays on
 * the screen that owns it.
 *
 * Returns the `discarding` ref the caller sets immediately before a navigation
 * the user has ALREADY confirmed, so the browser does not stack its own
 * "Leave site?" prompt on top — which phrases itself as a warning against the
 * very thing they just chose. A ref rather than state on purpose: it is read
 * inside the listener and must be current at the moment of the event, and
 * setting it must not cost a render on the way out of the page.
 *
 * jsdom cannot test any of this — it has no beforeunload behaviour to observe —
 * so the coverage is docs/superpowers/drivers/unsaved-guard.mjs, which asserts
 * both halves: that it warns with unsaved edits and stays silent when clean.
 */
export function useUnsavedGuard(dirty: boolean) {
  const discarding = useRef(false)

  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (discarding.current) return
      e.preventDefault()
      // Chrome and Firefox honour preventDefault alone; Safari has historically
      // needed returnValue, and without it the guard simply does not appear.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  return discarding
}
