import { useAuth } from './AuthProvider'

export type Role = 'admin'

/**
 * Reads the role from app_metadata. This drives UI visibility ONLY — it is
 * not a security boundary. Enforcement lives in the RLS policies, because
 * the anon key is public and the browser can claim anything.
 *
 * ONE ROLE, and null for everyone else — which since the login came out means
 * every anonymous visitor, not just a second class of account. `'user'` was
 * the other member until the anon work shipped; it existed so a non-admin
 * employee could size venues without reaching the Catalog, and that is now
 * what an account-less visitor gets for free.
 *
 * Still read from app_metadata rather than collapsed to `!!session`, which the
 * spec offers as the alternative. The claim is an explicit GRANT: an account
 * created without it gets the anonymous surface rather than the Catalog, so a
 * future limited account needs no code change to be limited. Collapsing to
 * `!!session` would make every account that can sign in an admin by
 * construction, and that is a one-way door for the sake of one comparison.
 */
export function useRole(): Role | null {
  const { session } = useAuth()
  return session?.user.app_metadata?.role === 'admin' ? 'admin' : null
}
