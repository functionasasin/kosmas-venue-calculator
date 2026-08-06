# PodPlay Venue Calculator

Internal Kosmas tool. Sizes a venue's materials list from
`docs/podplay-ph-venue-sizing.md`, which is the sole authority for the rules.

## Local development

    npm install
    cp .env.example .env      # fill in Supabase URL and anon key
    npm run dev
    npm test

## Deployment

Cloudflare Pages:

- Root directory: leave blank — the app is at the repository root
- Build command: `npm run build`
- Output directory: `dist`
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

`public/_redirects` routes every path to `index.html`, so a hard refresh on
`/venues/<id>` loads instead of 404ing.

Point the subdomain via the existing Cloudflare DNS zone. Do not hard-code
the hostname anywhere — the domain is moving from `fnasasin.com` to
`kosmasdns.com`.

## Database

Schema, policies and the catalog seed live in `supabase/`. Run them in order
against a new project; `supabase/README.md` covers the two accounts and the
`app_metadata` role assignment.

Authorization is enforced by Row Level Security, not by the UI. The anon key
ships in the JS bundle, so the browser is untrusted: hiding the catalog nav
from the `user` account is cosmetic, and the policies are the real boundary.

## Changing a SKU

Edit the item in the catalog and keep its role key. The formulas target role
keys, not SKUs, so nothing in the code changes. PoE watts and rack U feed the
budget and rack checks directly, so keep them accurate — and record the
**maximum** PoE draw, not the typical figure.

## Changing a rule

Rules live in `src/calculator/`, one module per doc section, each citing the
section it implements. Update `docs/podplay-ph-venue-sizing.md` first, then
grep for the section name to find the code.

The four worked examples in that doc are encoded as tests in
`src/calculator/index.test.ts`. If you change a rule, those tests should be
updated deliberately — a surprise failure there means the transcription
drifted from the doc.
