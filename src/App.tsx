import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from 'next-themes'
import { THEME_STORAGE_KEY } from '@/theme-init'
import { AuthProvider, useAuth } from '@/auth/AuthProvider'
import { useRole } from '@/auth/useRole'
import { Login } from '@/screens/Login'
import { Venues } from '@/screens/Venues'
import { VenueDetail } from '@/screens/VenueDetail'
import { Catalog } from '@/screens/Catalog'
import { Toaster } from '@/components/ui/sonner'

/**
 * The route table renders by DEFAULT, with no session.
 *
 * It used to return <Login/> for the whole tree whenever `session` was null,
 * which meant a venue owner or prospect needed an account minted by hand before
 * they could size anything. Anonymous venues go to localStorage (venueStore
 * dispatches on the venue's id prefix), the catalog comes from the narrowed
 * items_public view (0017), and the venues/venue_lines/venue_item_choices RLS
 * policies stay `to authenticated` — which is what keeps Kosmas's own venues
 * invisible here, rather than anything in this file.
 */
function Routed() {
  return (
    <Routes>
      <Route path="/" element={<Venues />} />
      <Route path="/venues/:id" element={<VenueDetail />} />
      <Route path="/login" element={<Login />} />
      <Route path="/catalog" element={<CatalogRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

/**
 * The ONE place `loading` still gates anything, and it has to.
 *
 * The gate was global. Left that way, every anonymous visitor waits on
 * supabase.auth.getSession() before the first paint, on a path that needs no
 * session. But deleting it outright is worse: useRole() returns null until the
 * session resolves, so a hard refresh on /catalog would take the redirect
 * branch below, land on "/", and never come back — an admin's bookmark that
 * silently stops working, with nothing on screen explaining it.
 *
 * So it renders a neutral shell here and nowhere else. Hiding /catalog is still
 * cosmetic; the RLS policies are the enforcement.
 *
 * The redirect is also the sign-out path FROM this screen: role goes null and
 * the admin is carried to a page they can still use. App.test.tsx pins that, so
 * a later tidy-up of this ternary cannot lose it.
 */
function CatalogRoute() {
  const { loading } = useAuth()
  const role = useRole()

  if (loading) return <div className="p-8">Loading…</div>
  return role === 'admin' ? <Catalog /> : <Navigate to="/" replace />
}

export default function App() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey={THEME_STORAGE_KEY}
    >
      <AuthProvider>
        <BrowserRouter>
          <Routed />
          <Toaster />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
