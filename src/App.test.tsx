import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// Driven per test. The factories below run when App is first imported, which is
// inside each test body, so these are initialised by then.
const auth = { session: null as Session | null, loading: false }
const role = { current: null as 'admin' | 'user' | null }
const signIn = vi.fn(async (_e: string, _p: string): Promise<string | null> => null)

vi.mock('@/auth/AuthProvider', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({ ...auth, signIn, signOut: vi.fn() }),
}))
vi.mock('@/auth/useRole', () => ({ useRole: () => role.current }))

// The four screens are stubs. Rendering the real ones would pull in the
// Supabase client and the whole data layer, and this file is about which
// element a URL resolves to — nothing else.
vi.mock('@/screens/Venues', () => ({ Venues: () => <p>venues screen</p> }))
vi.mock('@/screens/VenueDetail', () => ({ VenueDetail: () => <p>detail screen</p> }))
vi.mock('@/screens/Catalog', () => ({ Catalog: () => <p>catalog screen</p> }))
vi.mock('@/screens/Login', () => ({ Login: () => <p>login screen</p> }))

const SIGNED_IN = { user: { id: 'u1' } } as unknown as Session

const renderAt = async (path: string) => {
  // BrowserRouter reads window.location, and App constructs its own router, so
  // the URL is set before mounting rather than passed in.
  window.history.pushState({}, '', path)
  const { default: App } = await import('./App')
  return render(<App />)
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.session = null
  auth.loading = false
  role.current = null
})

describe('the app opens without an account', () => {
  // THE inversion. Until now App returned <Login/> for the whole tree whenever
  // there was no session, so every prospect needed an account minted by hand —
  // which is the entire cost this project removes.
  it('renders Venues at / with no session, instead of the login form', async () => {
    await renderAt('/')
    expect(screen.getByText('venues screen')).toBeInTheDocument()
    expect(screen.queryByText('login screen')).not.toBeInTheDocument()
  })

  it('opens a venue by URL with no session', async () => {
    await renderAt('/venues/local_abc')
    expect(screen.getByText('detail screen')).toBeInTheDocument()
  })

  // The loading gate used to block the ENTIRE tree. Left there, every anonymous
  // visitor would wait on supabase.auth.getSession() before anything painted —
  // on a path that needs no session at all.
  it('does not make an anonymous visitor wait for a session check', async () => {
    auth.loading = true
    await renderAt('/')
    expect(screen.getByText('venues screen')).toBeInTheDocument()
  })

  it('serves /login as a route rather than as a takeover', async () => {
    await renderAt('/login')
    expect(screen.getByText('login screen')).toBeInTheDocument()
  })
})

describe('/catalog stays admin-only', () => {
  // The reason the loading gate cannot simply be deleted along with the session
  // gate. useRole() returns null until getSession() resolves, so an unguarded
  // ternary sends a hard refresh on /catalog to "/" and never brings it back —
  // an admin's bookmark that quietly stops working.
  it('waits rather than redirecting while the session is still resolving', async () => {
    auth.loading = true
    role.current = null
    await renderAt('/catalog')
    expect(screen.queryByText('venues screen')).not.toBeInTheDocument()
    expect(screen.queryByText('catalog screen')).not.toBeInTheDocument()
  })

  it('renders Catalog once the session resolves as admin', async () => {
    auth.session = SIGNED_IN
    role.current = 'admin'
    await renderAt('/catalog')
    expect(screen.getByText('catalog screen')).toBeInTheDocument()
  })

  it('redirects an anonymous visitor away from /catalog', async () => {
    await renderAt('/catalog')
    expect(screen.getByText('venues screen')).toBeInTheDocument()
  })

  // The `user` account still exists — requirement 10 keeps it as the rollback
  // path — and it must still be kept out of the Catalog.
  it('redirects the non-admin account away from /catalog', async () => {
    auth.session = SIGNED_IN
    role.current = 'user'
    await renderAt('/catalog')
    expect(screen.getByText('venues screen')).toBeInTheDocument()
  })

  // Signing out while ON /catalog: role goes null and this ternary is what
  // carries the admin back to a page they can still use. It gets a test so a
  // later refactor of the route element cannot silently lose it.
  it('carries an admin off /catalog when their session ends', async () => {
    auth.session = SIGNED_IN
    role.current = 'admin'
    const { rerender } = await renderAt('/catalog')
    auth.session = null
    role.current = null
    const { default: App } = await import('./App')
    rerender(<App />)
    expect(screen.getByText('venues screen')).toBeInTheDocument()
  })
})

describe('the login screen as a route', () => {
  const renderLogin = async (entry: unknown = '/login') => {
    // The real Login, not App's stub of it.
    const { Login } = await vi.importActual<typeof import('@/screens/Login')>(
      '@/screens/Login',
    )
    return render(
      <MemoryRouter initialEntries={[entry as string]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<p>venues screen</p>} />
          <Route path="/catalog" element={<p>catalog screen</p>} />
        </Routes>
      </MemoryRouter>,
    )
  }

  beforeEach(() => {
    auth.session = null
    auth.loading = false
    signIn.mockClear()
    signIn.mockResolvedValue(null)
  })

  // Until now Login unmounted the whole tree, so "after signing in" meant
  // "after App re-rendered". As a route it has to move the user itself.
  it('navigates away on success', async () => {
    await renderLogin()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.c' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('venues screen')).toBeInTheDocument()
  })

  // signIn resolves to the error MESSAGE, not an error object and not a thrown
  // exception. Treating a rejected promise as the failure path would navigate
  // on every bad password.
  it('stays put and shows the message when the credentials are wrong', async () => {
    signIn.mockResolvedValue('Invalid login credentials')
    await renderLogin()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.c' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'nope' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Invalid login credentials')).toBeInTheDocument()
    expect(screen.queryByText('venues screen')).not.toBeInTheDocument()
  })

  // The origin rides in router state so that no path validation is needed. An
  // admin who clicked Sign in from /catalog lands back on /catalog.
  it('returns to where the visitor came from', async () => {
    await renderLogin({ pathname: '/login', state: { from: '/catalog' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.c' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('catalog screen')).toBeInTheDocument()
  })

  it('bounces a visitor who is already signed in', async () => {
    auth.session = SIGNED_IN
    await renderLogin()
    expect(screen.getByText('venues screen')).toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
  })

  // §1.5 says that redirect goes "to the origin, or /" — both halves, so the
  // bounce cannot quietly become a hard-coded "/" that strands an admin who
  // arrived from /catalog.
  it('bounces them to where they came from, not always to /', async () => {
    auth.session = SIGNED_IN
    await renderLogin({ pathname: '/login', state: { from: '/catalog' } })
    expect(screen.getByText('catalog screen')).toBeInTheDocument()
  })

  // The other tests never flip auth.session, so the <Navigate> branch is
  // unreachable in them. This one models what supabase actually does — resolve
  // the promise AND set the session, the way onAuthStateChange does.
  //
  // HONEST LIMIT: this does NOT discriminate the `signingIn` guard. Dropping
  // `&& !signingIn.current` was tried and this test still passed, because both
  // navigations target the same `from` and React reconciles them into one
  // observable outcome. The guard is correct by construction — one sign-in must
  // not produce two history writes — not by this assertion, and jsdom cannot
  // show the difference. Do not read a green here as proof the race is covered.
  it('makes exactly one navigation for one sign-in', async () => {
    signIn.mockImplementation(async () => { auth.session = SIGNED_IN; return null })
    await renderLogin({ pathname: '/login', state: { from: '/catalog' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.c' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('catalog screen')).toBeInTheDocument()
  })

  // As a full-screen takeover the card needed no navigation — there was nowhere
  // else. As a ROUTE, an anon who clicks Sign in and changes their mind has only
  // the browser Back button, and on a fresh tab opened at /login not even that.
  it('carries the way back to the venue list', async () => {
    await renderLogin()
    const back = screen.getByRole('link', { name: /all venues/i })
    expect(back.getAttribute('href')).toBe('/')
  })
})
