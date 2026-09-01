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

**That formula is written for a SWITCHED venue, and the one-court venue is not one.** `F7` is `IF(Z12=1,0,…)`, so a single-court venue has no switch and its court gear hangs off the gateway beside the Mac mini — the doc says so under § Firewall / gateway SKU, in a different section from the free-port sum, which is how the two went years without being read together. Applied unchanged at one court the sum reported **6 free ports where there were 3**, and a 1-court 4-door venue printed a clean BOM for a rack that cannot be wired. `courtLoadOnGateway` is the missing term; it is zero at every other court count, and `readersUnplaced` (not `readersOnSwitch`) carries the overflow, because there is no switch for anything to overflow onto.

**The tool warns there rather than sizing a switch, and that is deliberate.** A 1-court venue runs 1-2 doors — Kisi bills per door — and 2 doors plus a backup uplink is 8 of 8, so the ceiling is never reached by a venue we build. Past it the overflow is one or two ports, and the smallest switch this tool can size is a 24-port: that branch would spend ~$699 plus a patch panel, 1U and 50 W to land a single reader. `GATEWAY_OVERSUBSCRIBED` is a guard on a mistyped door count, not a supported configuration. Don't "finish" it by making `planSwitches` fall through to the band table.

**Readers on the gateway is a deliberate deviation, not the default.** PodPlay's guides put every reader on the switch; an installer following them verbatim will not do this. It is what keeps the 24-port build valid at 8 courts, where the court kit fills the switch exactly — hence `KISI_READER_PLACEMENT`, which exists so the choice is recorded per venue instead of happening silently. Don't delete it as noise.

`backupInternet` is an input for one reason: that eighth UDM port is what decides 24-port vs 48-port at the margin. It is inert on every non-Kisi tier, which is why the form only offers it on Autonomous and Autonomous+.

Readers are one BOM line but not one power source — the ones on the UDM-SE draw from the gateway's 180 W, so `checkPoeBudget` subtracts them from switch load. Charging the whole line to the switch would overstate it.

## Don't invent quantities the source defers

The spreadsheet marks some quantities `"TBD"` on purpose. Reproduce the TBD; don't derive a plausible number. Currently: **security camera junction box** (`IF(Z13=0,0,"TBD")` — not `= security_cameras`; the *replay* junction box genuinely is `= courts`, and both being a `PFA130-E` is what invites the mistake), and **access points** for every venue. A fabricated quantity reads as authoritative on a printed BOM. Access points are now the *only* TBD line a formula emits, so "Needs a decision" holds exactly one row on a stock Pro venue.

**The iPad fence bracket used to be the third, and is now gone entirely** (2026-08-17). It was folded into the **iPad Locking Wall Mount**, whose kit ships with the fence/pole hardware — a separate line double-buys. `ipad_fence_bracket` is out of `roleKeys.ts`, `perCourt.ts` and the seed, and `FENCE_BRACKET_MANUAL` went with it. **This is a claim about the mount SKU Kosmas buys, not a correction to the source**, which still carries row 46 and sizes it 1/court for Pickleball Kingdom — so reconciling code against the sheet will keep suggesting it be restored. Don't, unless the mount SKU changed; `perCourt.test.ts` fails if it comes back, and the original formula is preserved in `podplay-ph-venue-sizing.md`. The old trap still applies to the row that remains: don't copy `= courts` onto anything from the wall-mount row beside it.

## A role key can hold more than one active item now

Until `0011`, `items_role_key_active` meant one ACTIVE item per role key —
the catalog chose, and every venue got the same SKU whether it fit or not.
That index is gone. `items_role_key_default` (`0011`) replaces it:
uniqueness moved from ACTIVE to DEFAULT, so several items can share a role
key and exactly one of them is what a venue gets until it picks otherwise.
"Only one active item per role" is retired language — it is now one
*default* active item per role, and several active items is the supported,
intended state, not a bug to guard against. `ItemForm`'s role-key help text
and the Catalog screen's `Make default` control say so now.

**The Uniview/Dahua replay camera either/or is resolved this way, not by
flipping one for the other.** Kosmas builds venues on both — Tela Park on
the Uniview Owlview (2.8W), Helios Beta on the Dahua 5459T (17.5W) — and the
two are a full UPS rung apart at 14 courts (1000 VA vs 1500 VA), so the old
single-camera catalog was wrong for one of them no matter which camera it
held. `venue_item_choices` (`0012`) is one row per (venue, role key), only
for roles that have ever had more than one active item — a role with a
single option has nothing to pin.

**`0010` is deleted, unapplied. `0011`-`0014` replaced it.** `0010` would
have picked the Dahua for every venue by deactivating the Uniview — the same
either/or this feature exists to remove, just pointed the other way. `0011`
adds `is_default`, swaps the index, and adds `set_item_default` (one RPC, so
a default never moves as two writes with the role holding none in between).
`0012` adds `venue_item_choices` + RLS. `0013` swaps `save_venue` for a
4-argument overload that persists a venue's choices transactionally with its
lines — split that into two calls and a venue's pinned camera can disagree
with its `venue_lines.item_id`, which is exactly what `0007` eliminated for
the venue+lines write. `0014` activates the Dahua alongside the Uniview (the
Uniview keeps the default) and, in the same transaction, pins every existing
venue to the Uniview — so applying it changes no venue's output until
someone picks.

**`resolveCatalog` (`src/lib/resolveCatalog.ts`) is what keeps the sizing
engine safe from any of this.** `planUps`, `checkPoeBudget`, `sumRackU`, the
`POE_DATA_INCOMPLETE` check, `itemsByRole`, `itemIdFor` and more all assume
one active item per role, and they do not even fail the same way — a `Map`
keeps the last duplicate, a `find` keeps the first — so handed a role with
two active items, the UPS rung and the PoE check could disagree about which
camera holds it, with nothing raised anywhere. `resolveCatalog` runs once
per venue, before any of those, and re-establishes the invariant in memory:
the venue's choice wins if it is still active and still holds the role, else
the role's default, else the sole active item, else the role resolves to
nothing and a warning says so (`ROLE_NO_DEFAULT`, `CHOICE_UNAVAILABLE`)
rather than picking arbitrarily. If the engine itself ever becomes
choice-aware, this guarantee — and every one of those call sites' safety —
goes with it; don't remove `resolveCatalog` as a redundant layer.

## The swap picker is narrowed by role FAMILY, not by section

`ROLE_FAMILY` in `roleKeys.ts` groups role keys into the variants of one piece
of hardware — five `ups_*` rungs are one `ups`, both `gateway_udm_*` are one
`gateway`, `switch_24_std/24_pro/48_pro` are one `switch`. `swapOptionsFor`
filters a line's options by it.

**It replaced a section filter, and the section was never a plausible
constraint** (2026-08-25). `SECTION_FOR_CATEGORY` folds rack, compute, storage,
power and network into the one `Rack` band, so the UDM line offered patch
panels, a Kisi controller, three switches, five UPS rungs, four racks and an
SSD; the replay camera line offered the Autonomous+ security camera, which the
tier model says is not a substitute for it.

**Families are named for the FUNCTION, never the incumbent SKU** — `ipad` maps
to `tablet`, `apple_tv` to `media_player`, `flic` to `button`, `mac_mini` to
`server`. The string is a grouping key and is never rendered, so an accurate
name is free now and a rename later is not. Only a NEW KIND of thing reaches
this file; another SKU on an existing role key (a second display, an M4 Pro Mac
mini) needs no code at all — activate it and the swap picker and
`venue_item_choices` pick it up, which is the machinery `0011`-`0014` built.

Two cases deliberately keep the WHOLE active catalog, and both are the same
rule — a picker that offers nothing makes "No active item mapped for …"
permanent: a line whose item does not resolve at all, and a family whose every
item has been deactivated (`itemsByRole` ignores `isActive`, so the family is
known and merely empty). `MaterialsRow` mirrors the second one: `choosable` is
`options.length > 1 || !item`, so an unresolved row keeps its control however
few candidates exist.

**A row whose family holds one active item renders as plain text**, in the
inline picker and the phone dialog alike. That is about half the rows on a
stock Pro venue, and it is what lets a chevron mean "there is a real
alternative here" rather than opening a popup holding the item already on
screen. The deactivated current item counts toward the two — a retired SKU plus
its live replacement IS a choice.

`docs/superpowers/drivers/swap-options.mjs` is the only thing that can see any
of this; no unit test reads a popup, and the section filter was green for as
long as it was wrong.

**Item names stopped restating the role in `0016`.** `(Replay Camera)` on the
Dahua and `(Access Point)` on the U7-LR are gone — the picker carries the role
now, and on a printed BOM a role suffix reads as part of the SKU. The Dahua's
had a reason once: the same SKU was seeded twice, as `replay_camera` and as the
`security_camera` a placeholder now holds. **`(Owlview)` deliberately stays** —
it is Uniview's product-line name, the same kind of thing as `(U8000F)`,
`(Gen 2)` or `(M4)`, and the half of the name a supplier recognises. The seed
still carries both suffixes on purpose — `0016` asserts it renamed exactly one
row each, so a from-scratch rebuild needs a suffix to strip. **`0016` keys on
`role_key` plus that suffix, never on the full display name**, which is the
lesson of `0014`: its `like` predicate matched a different name in the seed than
in production, each satisfied its own count-1 assertion, and the drift went
unnoticed for weeks.

## One swap control, and it means two different things

**A swap that stays inside the line's own role writes the venue's CHOICE; a
swap across roles is a manual override.** `MaterialsTable`'s `swap()` decides
which, and the difference is the whole reason there is only one control.

A rail group called `HardwareChoices` used to make the same-role write, because
the row picker could only mint a manual line — and a manual line is exempt from
recalculation, so swapping the replay camera there printed the Dahua on a venue
still sized on the Uniview: same rung, same PoE budget, same port count, nothing
on screen saying so. Two controls, one of them silently wrong, for the one role
that has a second active item. **Removed 2026-08-25**; `VenueInputsForm` is
inputs only again, and `multiOptionRoles` is now read solely by `choicesToSave`.

What the delegating branch does and does not do:

- calls `onPick` → `venue_item_choices` → `resolveCatalog` → the engine. That is
  the only path a SKU choice reaches the rung, the ports and the PoE budget.
- re-points `venue_lines.item_id` immediately, so the row shows what was just
  picked rather than waiting for a recalculation.
- **leaves `source` alone.** The line stays a formula line, and the rows the
  choice moves *underneath* it — the rung, the switch — come up as stale for the
  Recalculate dialog. The camera is no longer in that diff, and its absence is
  how you tell delegation is working.
- requires the target to be ACTIVE. A pin on a deactivated item is
  `CHOICE_UNAVAILABLE` and `resolveCatalog` falls straight back to the default,
  so a swap onto a retired SKU stays a manual override — which is how a saved
  line survives its item's retirement.

**`CHOICE_OVERRIDDEN` was rewritten with it.** It used to fire for any manual
line on a chosen role, agreeing item or not, and told the user about "the picker
above". It now reports an actual disagreement between what the list NAMES and
what the venue is SIZED on — a hand-edited line freezes its quantity, which is
not this warning's business. Reachable now only for a line swapped before the
delegation existed, and for a role holding a second line.

`hardware-choice.mjs` drives all of this; the checks that discriminate it from
the old behaviour are the `edited` badge and the recalc diff.

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

## `print_note` is what the buyer must act on, never why

Two fields, and the difference is the whole point: `notes` is internal and
never printed; `print_note` is the ONLY item field that reaches a document
handed outside the company. Reasoning behind a spec belongs in `notes`, or
better, in `podplay-ph-venue-sizing.md` — not on the sheet.

That boundary had already slipped once. The UPS note reached **671 characters**
on all five rungs — seven printed lines under a one-line item — explaining the
PF 0.6 assumption, the online-unit exception, kVA vs VA and why AVR, all of
which the sizing doc already says. `0015` cut it to 194 and the 48-port panel's
to 264, moving the rest into `notes` by appending, so the rungs that already had
one kept it. Nothing actionable was dropped: watts-binds, the rung exception,
line-interactive/AVR, 230V, rack depth and capacity-not-runtime all survive.

`pdf-export.mjs` fails if any print note in the live catalog passes **300
characters**. That check reads catalog DATA, not code, so it is what stops the
field collecting an essay again.

## `upsertItem` writes only the columns it is handed

`ItemForm` builds its payload by hand, so any column written as
`item.foo ?? null` is **cleared every time someone edits an item**, whatever
they were editing. `is_default` was already guarded with a spread-when-present;
`mains_watts` was not, so renaming an item destroyed its mains draw — silently,
because a null reads to `calculateBOM` as a legitimate 0 W and the venue simply
re-sized ~2.4 VA smaller per lost watt. Fixed 2026-08-24 (`da64055`) with the
same spread, plus a Mains watts field on the form so the value can be typed back
at all, plus the Catalog's `Power` column so a wipe is visible.

**Any new nullable column on `items` needs the same three things**, in that
order: spread-when-present in `upsertItem`, a field in `ItemForm`, and somewhere
on screen the value can be read. A test in `items.test.ts` pins the write; it is
the layer that bites, because with the form field present either implementation
looks fine in a browser.

## A line that maps to no item names no item

`mergeRecalculation` mints an empty `itemId` when a role resolves to nothing.
Neither surface may fall back to a role lookup for those: `itemsByRole` is built
from the whole catalog with no active filter, so it returns a DEACTIVATED
candidate — whichever comes first of however many — which is the arbitrary
resolution `resolveCatalog` exists to prevent, printing a SKU nobody chose.
`buildPdfBody` has always dropped them (`if (!line.itemId) continue`);
`MaterialsSection` learned to in `863aea7`. A line whose `itemId` points at a
real-but-deactivated row still names it with the `(inactive)` badge — that is a
saved line surviving its item's retirement, and it is deliberate.

## Commands

Node 20+, run from the repo root.

```bash
npm run dev / build / preview
npm test              # vitest run
npx vitest run -t "19U resolves to 21U"    # single test
```

Green tests and a clean `tsc` do not see layout, a rendered PDF, or a tier
nobody has opened. `docs/superpowers/drivers/` drives the built app in Chrome —
`hardware-choice.mjs`, `tiers.mjs`, `pdf-export.mjs`, sharing `lib/harness.mjs`,
which carries the real production catalog and needs no credentials. Run them
from the repo root against a preview build, and read the README there first:

```bash
npm run build && (npx vite preview --port 4173 &) && sleep 4
OUT=/tmp/x node docs/superpowers/drivers/pdf-export.mjs   # expect ALL CHECKS PASSED
```
