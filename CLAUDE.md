# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

PodPlay Venue Calculator — internal React/Vite/TypeScript + Supabase app that sizes a venue's materials list from court count and tier. **Built and deployed**: four screens (Login, Venues, VenueDetail, Catalog), the sizing engine under `src/calculator/`, PDF export, Supabase auth + RLS, and a light/dark theme. Cloudflare Pages builds from `main`; see the Deployment section of `README.md` for the required build variables.

These two are still the reference for *why* things are the way they are, not a to-do list:

- `docs/superpowers/specs/2026-08-05-venue-calculator-design.md` — architecture, data model, all sizing rules, security, scope
- `docs/superpowers/plans/2026-08-05-venue-calculator.md` — the 18-task TDD plan it was built from, with a Global Constraints section

## Never delete `docs/superpowers/`

The global rule about deleting `docs/` and `.superpowers/` after an implementation workflow **does not apply here**. Those two files are the entire project right now, and the user reads them *after* the build. Leave them, don't `.gitignore` them, delete only if explicitly asked.

## The sizing docs are in another repo

The spec and plan cite `docs/podplay-ph-venue-sizing.md` (the sizing authority), `docs/podplay-tiers-reference.md` and `docs/kosmas-inventory.md` as repo-relative — but all three are in **Kosmas Setup**, at `~/Desktop/Kosmas Setup/docs/`. Add that as a working directory to read them. `Tela Park Pricing.docx` and `reference pdfs/podplay-venue-deployment-guide.pdf` are there too.

Don't copy them here — the sizing doc is still being edited there, and a copy would fork into a competing authority. Rule changes go: edit the sizing doc first, then the code. Never modify `podplay-bom-reference.md` (read-only sheet dump).

## The 5-tier model

`Tier` is `basic | basic_plus | pro | autonomous | autonomous_plus`, confirmed with PodPlay on 2026-08-11. Full definitions in `podplay-tiers-reference.md`; what matters when writing formulas:

| Tier | Rack | Court-side | In this tool |
|---|---|---|---|
| Basic | none | none — booking website only | blocked — nothing to size |
| Basic+ | none | none — booking app only | blocked — nothing to size |
| Pro | Mac mini · UDM · USW-Pro · UPS · patch panel | display · iPad · Apple TV · replay cam · PoE adapter · Flic | fully covered |
| Autonomous | Pro + Kisi Controller Pro 2 (1 per 4 doors), **no NVR** | Pro + Reader Pro 2.1/door + push-to-exit on mag-lock doors, **no security cameras** | controller + readers sized; push-to-exit by hand |
| Autonomous+ | Autonomous + UNVR/UNVR-Pro + 8TB HDDs | Autonomous + EmpireTech PoE cameras + PFA130-E boxes | as Autonomous; NVR + HDDs by hand |

**There is no Pro+.** It was recorded as a tier between Pro and Autonomous carrying "Partial / Custom" door access and optional monitoring, and was removed on 2026-08-11. Door access is now all-or-nothing: any venue wanting a Kisi door is Autonomous. Don't reintroduce a partial tier, and don't read an old "Pro+" quote as either Pro or Autonomous automatically — which it is depends on whether it had doors, and that's a per-deal call.

**Autonomous and Autonomous+ are not interchangeable.** The boundary is surveillance: Autonomous is access control only. A warning that tells an Autonomous venue it's missing an NVR is wrong. `security_cameras > 0` is valid on Autonomous+ only; `kisi_doors > 0` on Autonomous / Autonomous+.

**The gates in `gates.ts` ARE the tier definitions — do not "simplify" them away.** It is true that no sizing module reads `inputs.tier`: `pickGateway` keys off `kisiDoors`, `planSwitches` off `securityCameras || kisiDoors || courts`, `totalPorts` off `courts + securityCameras`. **That does not make the tier a mere label** — it makes `SECURITY_CAMERA_TIERS` and `KISI_TIERS` the *only* thing keeping a tier off hardware it doesn't include. Deleting them was tried on 2026-08-10 and reverted the same day: it let a Pro venue be specced with the very door access that defines it as not-Pro.

**Corollary: the tier is chosen, never inferred.** Basic and Basic+ are hardware-identical — the difference is that Basic+ gives the venue its own booking app on iOS and Android, where Basic is the website alone. It is **not** an owner/admin tool; owners already have the admin dashboard at Basic. So nothing in the inputs can distinguish them. More generally the tiers describe operating models — Pro is "Premium tech-enabled club", Autonomous is "Staff-light operations" — and the tool has no input for how a venue is staffed.

**Basic is live, and its 2026-08-10 retirement was undone.** Basic was briefly removed on the reasoning that bare Basic doesn't sell in SEA/Asia; that's a real market observation but it was wrong as a statement of the lineup. Basic is the booking website alone — **no hardware at all**.

**Neither Basic nor Basic+ has any hardware** (corrected 2026-08-14). Basic+ was recorded as carrying BBPOS payment terminals, and a test asserted its block message said so. That was never sourced: the original tiers doc put terminals on *both* lowest tiers, and when Basic was edited down to "no hardware at all" during the 2026-08-10 retirement the line survived on Basic+ alone — inventing a boundary rather than recording one. The Help Center also puts Payment Integration at Basic, so any card reader would start there. Don't reintroduce it; if PodPlay supplies readers it's a payment-integration question spanning every tier. A test now asserts *neither* message names hardware.

Both tiers block, but with different messages: Basic+ adds the venue its own booking app on iOS and Android, which is the whole difference. **That app is not the court-side software on the iPads and Apple TVs** — same word, different product, and that one starts at Pro.

**`venues.tier` is plain `text` with no check constraint**, so a row can hold a tier the app no longer offers — `'pro_plus'` is the live example. `readTier` in `src/data/venues.ts` passes the five live tiers through and falls back to `'pro'` for anything else. **That fallback is a guard, not a translation**: it doesn't claim Pro+ meant Pro. It only stops the tier `<select>` rendering an option that doesn't exist, which otherwise shows the wrong tier as current and surfaces only on the next save. If such a row has doors or cameras, Pro's gates block it — which is the point, since the tier then gets re-picked deliberately. Three tests guard this.

**On tier semantics, `podplay-tiers-reference.md` outranks the sizing doc.** The sizing doc is the authority for *sizing*; for what a tier includes the order is co-founder tier definitions → spreadsheet hardware gating → other PodPlay docs. PodPlay's own materials disagree with each other, and the tiers doc is the resolution.

**Tier changes follow a required order** — write `podplay-tiers-reference.md` first, then the code. Both the Basic retirement (2026-08-10) and its reversal plus the Pro+ removal (2026-08-11) were done that way. Keep it.

**PH reality:** nearly every PH deployment is Pro. Kisi hardware, NVRs and security cameras aren't stocked locally and ship from US/HK — the Autonomous tiers carry a lead-time cost, not just a scope caveat. Basic and Basic+ are uncommon here too, but that's demand, not policy.

## The switch is sized with Kisi in it — the spreadsheet isn't

`Cost Analysis!F7` bands switch quantity on replay cameras + iPads + Apple TVs + security cameras, with **no Kisi term at all**, so the sheet sizes an Autonomous venue's switch as if its doors did not exist. Two further defects hide the shortfall: `P38` reports the controller count where the reader count belongs, and `Z26` pools the gateway's 8 RJ45 ports into "ports available".

`src/calculator/kisi.ts` is the honest count. Controllers go on the UDM (1 per 4 doors — the *intent*; `F37` tests the empty cell `Z16` and returns 1 for every venue). Readers take UDM-SE PoE ports first — `8 − 1 (Mac mini) − controllers − backup WAN` — and only the overflow reaches `totalPorts`. The UDM↔switch uplink is an SFP DAC and consumes no RJ45, which is why it never appears in that sum.

**Readers on the gateway is a deliberate deviation, not the default.** PodPlay's guides put every reader on the switch; an installer following them verbatim will not do this. It is what keeps the 24-port build valid at 8 courts, where the court kit fills the switch exactly — hence `KISI_READER_PLACEMENT`, which exists so the choice is recorded per venue instead of happening silently. Don't delete it as noise.

`backupInternet` is an input for one reason: that eighth UDM port is what decides 24-port vs 48-port at the margin. It is inert on every non-Kisi tier, which is why the form only offers it on Autonomous and Autonomous+.

Readers are one BOM line but not one power source — the ones on the UDM-SE draw from the gateway's 180 W, so `checkPoeBudget` subtracts them from switch load. Charging the whole line to the switch would overstate it.

## Don't invent quantities the source defers

The spreadsheet marks some quantities `"TBD"` on purpose. Reproduce the TBD; don't derive a plausible number. Currently: **security camera junction box** (`IF(Z13=0,0,"TBD")` — not `= security_cameras`; the *replay* junction box genuinely is `= courts`, and both being a `PFA130-E` is what invites the mistake), and **access points** for every venue. A fabricated quantity reads as authoritative on a printed BOM. Access points are now the *only* TBD line a formula emits, so "Needs a decision" holds exactly one row on a stock Pro venue.

**The iPad fence bracket used to be the third, and is now gone entirely** (2026-08-17). It was folded into the **iPad Locking Wall Mount**, whose kit ships with the fence/pole hardware — a separate line double-buys. `ipad_fence_bracket` is out of `roleKeys.ts`, `perCourt.ts` and the seed, and `FENCE_BRACKET_MANUAL` went with it. **This is a claim about the mount SKU Kosmas buys, not a correction to the source**, which still carries row 46 and sizes it 1/court for Pickleball Kingdom — so reconciling code against the sheet will keep suggesting it be restored. Don't, unless the mount SKU changed; `perCourt.test.ts` fails if it comes back, and the original formula is preserved in `podplay-ph-venue-sizing.md`. The old trap still applies to the row that remains: don't copy `= courts` onto anything from the wall-mount row beside it.

## There is no brand input

*"Brand" here means the venue **operator** — PodPlay / PingPod / Pickleball Kingdom, a sizing input. Not the Kosmas brand book two sections below, which governs the logo. Different things, same word.*

Removed 2026-08-11. The source gates five rules on the venue operator's brand — PodPlay / PingPod / Pickleball Kingdom — but Kosmas builds only PodPlay-brand venues, and `podplay-ph-venue-sizing.md` § Camera color says outright that "KOSMAS / PodPlay venues" are the same thing for these purposes. The picker offered one real value plus one that blocked the calculation (PingPod) and one for venues we don't build.

Removing it changed no output: the fence bracket was already TBD for every non-PBK venue, signage (`courts × 2`) and access points (TBD) never varied, and the PingPod-only rows (audio amp, sound processor, speakers, front-desk kit) were never emitted. The `BRAND_UNSUPPORTED` gate went with it — nothing can select PingPod any more. **`venues.brand` still exists in the schema** as `not null default 'podplay'`; the app neither reads nor writes it. Don't reintroduce the input to "support" a brand without checking whether Kosmas actually deploys it.

Related: the source's Kisi controller formula tests an empty cell and so always returns 1 regardless of door count. Implement the *intent* (1 per 4 doors), not the bug — see `podplay-tiers-reference.md`.

## The brand book is the authority on the logo

It lives in **another private repo** — `functionasasin/kosmas-web`, at `guides/Kosmas Athletic Venture Co_BrandGuidelines_2026.pdf`. Fetch it with `gh api "repos/functionasasin/kosmas-web/contents/guides/Kosmas%20Athletic%20Venture%20Co_BrandGuidelines_2026.pdf" -H "Accept: application/vnd.github.raw"`. The approved vector artwork is at `~/Desktop/KOSMAS-LOGO.svg`, and it is what `src/components/KosmasLogo.tsx` was vendored from. `guides/WEBSITE DESIGN BRIEF.pdf` beside it is scoped to the KAVC marketing site, not this tool — it only matters here because it defers to the brand book.

What binds:

- **Four approved versions, "no other colors or alterations permitted"** (p3-4). Colours are red `#E31F26`, blue `#005490`, gold `#D2AB67` (p7), plus `#194F81` for the ™ in the Color version — read off the artwork, not the PDF, whose rasters carry compression drift.
- **The runner may not stand alone in-app.** p6 bans the incomplete logo, p5 bans cropping "in any way". The mark alone is sanctioned only as a social/app icon — which is exactly what `public/favicon.svg` is, and the only place it is allowed.
- **Minimum size 38 mm ≈ 144px.** The lockup ships at `w-[9.2rem]` (147.2px) on every surface. One size everywhere is deliberate; a second is a second thing to keep in step.
- The tagline is illegible at that size and that is **accepted, not overlooked** — kosmas.com.ph does the same thing at the same size. Don't "fix" it by cropping it off.

## `--word` is white in both themes, so the lockup needs a dark ground

`--mark`/`--word`/`--tag`/`--tm` in `index.css` are the logo's fills. `--word` and `--tm` are `#FFFFFF` in **light and dark alike**, because the lockup has only ever sat on `--railhd` — navy `#005490` in light, near-black `#1C1D20` in dark. Both are the "dark solid color background" the book specifies the White logo for, so the shipped tokens already paint an approved version and nothing needs switching.

**The corollary is a trap.** Put the lockup on `--card` and the wordmark paints white on white in light mode — invisible, and invisible in a way that reads as a missing asset rather than a colour bug. That mistake was made twice while prototyping the 2026-08-15 placements. `src/components/BrandBlock.tsx` exists so the ground travels with the lockup, and a test pins `bg-railhd` and `border-gold` on it.

If a lockup ever does need to sit on white, that is the **Color version** — blue `#005490` wordmark, gold tagline, `#194F81` ™ — and it needs new tokens, because none exist. A `surface` prop was designed for exactly this and then not built, since putting the band on every screen removed the only case that wanted it.

`--tag` and `--tm` were corrected to book values in `86908a6`; two tests pin them so a future "accessibility fix" that re-tints either one fails loudly.

## Where the logo goes

`BrandBlock` is the band — `--railhd` ground, gold rule, lockup — used on all four screens. `align="center"` for narrow containers, left gutter for full-width ones; that is the rule, not a per-screen whim. Left-aligning in the 232px rail left 51.8px of dead space and read as shoved aside.

| Screen | Placement |
|---|---|
| Venues, Catalog | Full-width band above the toolbar, lockup on the left gutter |
| Login | Band as the card's header (`pt-0` on the Card), lockup centred |
| VenueDetail | Rail head, lockup **and** venue name centred |

The band scrolls away; the toolbars under it stay `sticky top-0` and Catalog's back row keeps `top-13`. Don't make the band sticky — that puts *New venue* and *Save* out of reach on a long list.

Aligning the lockup against text needs an optical offset, not `align-items: center`: the SVG box spans runner, wordmark, tagline and ™, so its centre sits ~1.94px **below** the wordmark's at 147px. Centre on the box and adjacent text reads low.

## Commands

Node 20+, run from the repo root.

```bash
npm run dev / build / preview
npm test              # vitest run
npx vitest run -t "19U resolves to 21U"    # single test
```
