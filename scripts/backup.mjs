// Snapshots every table to timestamped JSON in ./backups/.
//
// `supabase db dump` would be the obvious tool, but it shells out to Docker to
// run pg_dump and Docker is not installed here — so this goes through PostgREST
// instead, which needs nothing beyond the .env already in the repo.
//
// Scope: DATA ONLY. The schema lives in supabase/migrations/ and is not dumped.
// Restoring means re-running the migrations, then feeding these rows back.
//
//   node scripts/backup.mjs                 # uses SUPABASE_EMAIL / _PASSWORD
//   SUPABASE_EMAIL=… SUPABASE_PASSWORD=… node scripts/backup.mjs
//
// RLS applies to the account you sign in as, so back up as the admin: a `user`
// token can read everything today, but a future policy change could silently
// narrow what lands in the file.

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'

const TABLES = ['items', 'venues', 'venue_lines', 'venue_item_choices']

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trimStart().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_ANON_KEY
const email = process.env.SUPABASE_EMAIL
const password = process.env.SUPABASE_PASSWORD

if (!url || !key) throw new Error('.env is missing VITE_SUPABASE_URL / _ANON_KEY')
if (!email || !password) {
  throw new Error('Set SUPABASE_EMAIL and SUPABASE_PASSWORD (admin account) in the environment')
}

const auth = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: key, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
})
if (!auth.ok) throw new Error(`sign-in failed: ${auth.status} ${await auth.text()}`)
const { access_token: token } = await auth.json()

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const dir = new URL(`../backups/${stamp}/`, import.meta.url)
mkdirSync(dir, { recursive: true })

for (const table of TABLES) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`)
  const rows = await res.json()
  // An empty table is a legitimate state (venues often is), so this is not an
  // error — but it is worth seeing, because it is also what a silently failed
  // read looks like.
  writeFileSync(new URL(`${table}.json`, dir), JSON.stringify(rows, null, 2))
  console.log(`${table.padEnd(12)} ${String(rows.length).padStart(4)} rows`)
}

console.log(`\nwritten to backups/${stamp}/`)
