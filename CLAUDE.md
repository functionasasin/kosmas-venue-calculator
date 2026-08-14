# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

PodPlay Venue Calculator — internal React/Vite/TypeScript + Supabase app that sizes a venue's materials list from court count and tier. **No code exists yet.** Read these two before starting; they are the real brief:

- `docs/superpowers/specs/2026-08-05-venue-calculator-design.md` — architecture, data model, all sizing rules, security, scope
- `docs/superpowers/plans/2026-08-05-venue-calculator.md` — 18-task TDD plan with a Global Constraints section

Resume with: "start the venue calculator plan."

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
| Basic+ | none | BBPOS terminals only | blocked — nothing to size |
| Pro | Mac mini · UDM · USW-Pro · UPS · patch panel | display · iPad · Apple TV · replay cam · PoE adapter · Flic | fully covered |
| Autonomous | Pro + Kisi Controller Pro 2 (1 per 4 doors), **no NVR** | Pro + Reader Pro 2.1/door + push-to-exit on mag-lock doors, **no security cameras** | controller + readers sized; push-to-exit by hand |
| Autonomous+ | Autonomous + UNVR/UNVR-Pro + 8TB HDDs | Autonomous + EmpireTech PoE cameras + PFA130-E boxes | as Autonomous; NVR + HDDs by hand |

**There is no Pro+.** It was recorded as a tier between Pro and Autonomous carrying "Partial / Custom" door access and optional monitoring, and was removed on 2026-08-11. Door access is now all-or-nothing: any venue wanting a Kisi door is Autonomous. Don't reintroduce a partial tier, and don't read an old "Pro+" quote as either Pro or Autonomous automatically — which it is depends on whether it had doors, and that's a per-deal call.

**Autonomous and Autonomous+ are not interchangeable.** The boundary is surveillance: Autonomous is access control only. A warning that tells an Autonomous venue it's missing an NVR is wrong. `security_cameras > 0` is valid on Autonomous+ only; `kisi_doors > 0` on Autonomous / Autonomous+.

**The gates in `gates.ts` ARE the tier definitions — do not "simplify" them away.** It is true that no sizing module reads `inputs.tier`: `pickGateway` keys off `kisiDoors`, `planSwitches` off `securityCameras || kisiDoors || courts`, `totalPorts` off `courts + securityCameras`. **That does not make the tier a mere label** — it makes `SECURITY_CAMERA_TIERS` and `KISI_TIERS` the *only* thing keeping a tier off hardware it doesn't include. Deleting them was tried on 2026-08-10 and reverted the same day: it let a Pro venue be specced with the very door access that defines it as not-Pro.

**Corollary: the tier is chosen, never inferred.** Basic and Basic+ are hardware-identical — the difference is that Basic+ gives the venue its own booking app on iOS and Android, where Basic is the website alone. It is **not** an owner/admin tool; owners already have the admin dashboard at Basic. So nothing in the inputs can distinguish them. More generally the tiers describe operating models — Pro is "Premium tech-enabled club", Autonomous is "Staff-light operations" — and the tool has no input for how a venue is staffed.

**Basic is live, and its 2026-08-10 retirement was undone.** Basic was briefly removed on the reasoning that bare Basic doesn't sell in SEA/Asia; that's a real market observation but it was wrong as a statement of the lineup. Basic is the booking website alone — **no hardware at all**, not even BBPOS terminals, which start at Basic+. Both tiers block here, but with different messages: naming terminals in the Basic block would tell a buyer to order hardware that tier doesn't have. A test guards that.

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

The spreadsheet marks some quantities `"TBD"` on purpose. Reproduce the TBD; don't derive a plausible number. Currently: **security camera junction box** (`IF(Z13=0,0,"TBD")` — not `= security_cameras`; the *replay* junction box genuinely is `= courts`, and both being a `PFA130-E` is what invites the mistake), the **iPad fence bracket** (auto-sized only for Pickleball Kingdom venues, which Kosmas does not build — so always deferred here; don't copy `= courts` off the wall-mount row beside it), and **access points** for every venue. A fabricated quantity reads as authoritative on a printed BOM.

## There is no brand input

Removed 2026-08-11. The source gates five rules on the venue operator's brand — PodPlay / PingPod / Pickleball Kingdom — but Kosmas builds only PodPlay-brand venues, and `podplay-ph-venue-sizing.md` § Camera color says outright that "KOSMAS / PodPlay venues" are the same thing for these purposes. The picker offered one real value plus one that blocked the calculation (PingPod) and one for venues we don't build.

Removing it changed no output: the fence bracket was already TBD for every non-PBK venue, signage (`courts × 2`) and access points (TBD) never varied, and the PingPod-only rows (audio amp, sound processor, speakers, front-desk kit) were never emitted. The `BRAND_UNSUPPORTED` gate went with it — nothing can select PingPod any more. **`venues.brand` still exists in the schema** as `not null default 'podplay'`; the app neither reads nor writes it. Don't reintroduce the input to "support" a brand without checking whether Kosmas actually deploys it.

Related: the source's Kisi controller formula tests an empty cell and so always returns 1 regardless of door count. Implement the *intent* (1 per 4 doors), not the bug — see `podplay-tiers-reference.md`.

## Task 1 will delete this repo if run carelessly

`npm create vite@latest` in a non-empty directory prompts *"Remove existing files and continue"* — which takes out `docs/`, `.git/` and this file. Scaffold into a temp dir and rsync in with `--exclude 'docs' --exclude '.git'`. The plan spells it out.

## Commands

Arrive with Task 1. Node 20+, run from the repo root.

```bash
npm run dev / build / preview
npm test              # vitest run
npx vitest run -t "19U resolves to 21U"    # single test
```
