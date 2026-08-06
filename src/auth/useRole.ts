import { useAuth } from './AuthProvider'

export type Role = 'admin' | 'user'

/**
 * Reads the role from app_metadata. This drives UI visibility ONLY — it is
 * not a security boundary. Enforcement lives in the RLS policies, because
 * the anon key is public and the browser can claim anything.
 */
export function useRole(): Role | null {
  const { session } = useAuth()
  const role = session?.user.app_metadata?.role
  return role === 'admin' || role === 'user' ? role : null
}
