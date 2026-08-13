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

function Routed() {
  const { session, loading } = useAuth()
  const role = useRole()

  if (loading) return <div className="p-8">Loading…</div>
  if (!session) return <Login />

  return (
    <Routes>
      <Route path="/" element={<Venues />} />
      <Route path="/venues/:id" element={<VenueDetail />} />
      {/* Hiding /catalog is cosmetic; the RLS policies are the enforcement. */}
      <Route
        path="/catalog"
        element={role === 'admin' ? <Catalog /> : <Navigate to="/" replace />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
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
