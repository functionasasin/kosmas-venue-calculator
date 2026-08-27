import { useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeftIcon } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BrandBlock } from '@/components/BrandBlock'

export function Login() {
  const { signIn, session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /**
   * Where to go on success. Carried in router STATE, not a `?next=` query
   * param: a param can be typed into an address bar, so it would need
   * same-origin path validation to avoid becoming an open redirect. State
   * cannot, so the question never arises.
   */
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  /**
   * True from the instant submit() fires, so the already-signed-in redirect
   * below cannot ALSO fire for the session this form just created.
   *
   * signIn resolves after supabase has set the session, which fires
   * onAuthStateChange (AuthProvider.tsx:23-25) and re-renders this component
   * with `session` non-null. Two navigations for one sign-in race, and the
   * loser replaces the history entry the winner just wrote.
   */
  const signingIn = useRef(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    signingIn.current = true
    setBusy(true)
    // The resolved value is the error MESSAGE or null — not an error object,
    // and signIn does not throw. `catch` here would never run and a truthiness
    // test would be a coin flip on the empty string.
    const message = await signIn(email, password)
    setBusy(false)
    setError(message)
    if (message === null) navigate(from, { replace: true })
    else signingIn.current = false
  }

  // Nothing for an already signed-in visitor to do here. `replace` so Back does
  // not bounce them straight into this same redirect.
  if (session && !signingIn.current) return <Navigate to={from} replace />

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      {/* The column exists so the card and the way out centre as one block.
          max-w-sm moved here off the Card for the same reason — the link has to
          measure itself against the card's width, not the viewport's. */}
      <div className="flex w-full max-w-sm flex-col items-center">
        {/* pt-0 so the band sits flush at the top; the Card already clips to its
            own rounded corners. The card's gap still separates the band from the
            title, so nothing else needs adjusting.

            Centred, and at the same 9.2rem as every other placement — the login
            card is the one screen with room for a larger lockup, but a second
            size would be a second thing to keep in step for no gain. */}
        <Card className="w-full pt-0">
          <BrandBlock align="center" className="px-6 py-5" />
          <CardHeader><CardTitle>Venue Calculator</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} required
                  onChange={e => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} required
                  onChange={e => setPassword(e.target.value)} />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* As a takeover this screen needed no way out — there was nowhere else to
            be. As a route it does: an anon who clicks Sign in and changes their
            mind otherwise has only the browser Back button, and none at all on a
            tab opened straight at /login.

            NOT the shared BackToVenues row, which Catalog and the venue page
            still use. That row is a full-bleed bar with its own rule, built for
            the slot between a screen's header block and its content. The login
            card has no such slot, so inside it the row stacked as a SECOND header
            under the brand band and put a way out above the title. Out here the
            link is what it actually is — page navigation, not a form action — and
            the card stays one unbroken sign-in panel.

            text-xs, not the row's text-[11px]: that 11px is sized for dense
            chrome under a header, and alone on the ground it reads undersized.
            --muted-foreground is 4.80:1 on --background in light and 6.9:1 in
            dark, so it clears 4.5:1 on both. px-3 py-2 pads the target past the
            width of the words without pretending this is a primary control. */}
        <Link
          to="/"
          className="mt-3.5 flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs
                     text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeftIcon className="size-3.5" aria-hidden />
          All venues
        </Link>
      </div>
    </div>
  )
}
