import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

/**
 * Typed against the live schema, so every `.from(...).select(...)` returns real
 * column types instead of `any`. Regenerate with `npm run types:gen` after any
 * migration — a stale generated file is worse than none, because it type-checks
 * against a schema that no longer exists.
 */
export const supabase = createClient<Database>(url, anonKey)
