# PodPlay Venue Calculator

Kosmas tool that sizes a venue's materials list from court count and tier. The
sizing rules come from `podplay-ph-venue-sizing.md`, which lives in the Kosmas
Setup repo and is the sole authority for them.

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
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  and `NODE_VERSION=22` (Vite 8 needs Node >=20.19; the platform default
  can be older, and the build fails with an engine mismatch)

Set the two `VITE_` variables **before the first build**. Vite inlines them at
build time, so a deploy made without them produces a bundle that throws
"Missing VITE_SUPABASE_URL" in the browser — adding them later needs a
rebuild, not just a restart.

The anon key belongs here; it is public by design and already ships in the
bundle. The `service_role` key must never be set as a build variable.

`public/_redirects` routes every path to `index.html`, so a hard refresh on
`/venues/<id>` loads instead of 404ing.

Point the subdomain via the existing Cloudflare DNS zone. Do not hard-code
the hostname anywhere — the domain is moving from `fnasasin.com` to
`kosmasdns.com`.

## Database

Schema, policies and the catalog seed live in `supabase/`. Run them against a
new project in **numeric order, with the seed in its own position** (`0001`,
`0002`, `seed/0003`, then `0004` onwards) — not all the migrations followed by
the seed, which fails. `supabase/README.md` explains why, and covers the two
accounts and the `app_metadata` role assignment.

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
