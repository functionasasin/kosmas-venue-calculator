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

## The 4-tier model

`Tier` is `basic_plus | pro | autonomous | autonomous_plus`. Full definitions in `podplay-tiers-reference.md`; what matters when writing formulas:

| Tier | Rack | Court-side | In this tool |
|---|---|---|---|
| Basic+ | none | BBPOS terminals only | blocked — nothing to size |
| Pro | Mac mini · UDM · USW-Pro · UPS · patch panel (+ partial Kisi / optional NVR when doors or cameras are entered) | display · iPad · Apple TV · replay cam · PoE adapter · Flic (+ optional readers/cameras) | fully covered; a starting point once doors or cameras are added |
| Autonomous | Pro + Kisi Controller Pro 2 (1 per 4 doors), **no NVR** | Pro + Reader Pro 2.1/door + push-to-exit on mag-lock doors, **no security cameras** | Kisi kit added by hand |
| Autonomous+ | Autonomous + UNVR/UNVR-Pro + 8TB HDDs | Autonomous + EmpireTech PoE cameras + PFA130-E boxes | Kisi kit, NVR, HDDs added by hand |

**Autonomous and Autonomous+ are not interchangeable.** The boundary is surveillance: Autonomous is access control only. A warning that tells an Autonomous venue it's missing an NVR is wrong. **This is now the only tier gate on cameras** — `security_cameras > 0` is valid on Pro and Autonomous+, invalid on Autonomous. `kisi_doors > 0` is valid on every tier the tool sizes, so there is no Kisi gate at all.

**Pro+ was folded into Pro on 2026-08-10.** The reason it could be: **nothing in the engine ever read `tier` to size a venue.** `pickGateway` keys off `kisiDoors`, `planSwitches` off `securityCameras || kisiDoors || courts`, `totalPorts` off `courts + securityCameras` — grep `network.ts` and `perCourt.ts` for `inputs.tier` and you get nothing. Pro+ existed only as a *validation* label saying "this deal includes access/monitoring", so merging it changes no BOM: a Pro venue with 2 doors gets the UDM-SE it always would have. The two warnings that were scoped to the Pro+ label are now keyed off `kisiDoors > 0 || securityCameras > 0`, which is strictly more accurate — a Pro+ venue with neither used to get a lead-time warning about hardware it wasn't buying.

**Don't reintroduce a tier to carry a sizing rule.** If a rule depends on hardware, key it off the input that represents that hardware. The tier is a commercial label; the inputs are the spec.

**Basic was retired on 2026-08-10 and Basic+ is now the lowest tier.** The co-founders' original breakdown had a Basic tier below Basic+; PodPlay dropped it because bare Basic doesn't sell in SEA/Asia — customers here want the deployment customized, so Basic+ is the realistic entry case. Don't reintroduce it. Basic+ adds no hardware over the retired tier — BBPOS terminals are the entire footprint and everything else in the tier is software — so don't word the block as though Basic+ adds hardware. Note the tiers doc describes that software as "native iOS + Android apps"; that is PodPlay's claim, unverified here, and it has no bearing on sizing either way.

**`venues.tier` is plain `text` with no check constraint**, so rows written before either change can still hold `'basic'` or `'pro_plus'`. `readTier` in `src/data/venues.ts` maps them to `basic_plus` and `pro` on read. Without it the tier `<select>` renders a value matching no option and silently shows some other tier as current — a mismatch that only surfaces on the next save. Two tests guard it; extend that map, don't replace it, if a tier is ever retired again.

**On tier semantics, `podplay-tiers-reference.md` outranks the sizing doc.** The sizing doc is the authority for *sizing*; for what a tier includes the order is co-founder tier definitions → spreadsheet hardware gating → other PodPlay docs. PodPlay's own materials disagree with each other, and the tiers doc is the resolution. Pro+ was never in the calculation spreadsheet at all, which is why it never had a formula-driven BOM — and ultimately why it was merged away.

**The Basic retirement and the Pro/Pro+ merge are recorded in different places, deliberately.** Basic's retirement was written into `podplay-tiers-reference.md` *first*, dated 2026-08-10, and the code followed — the required order. The Pro/Pro+ merge went the other way: the user decided it in conversation and the code changed first, so **`podplay-tiers-reference.md` still documents Pro+ as a live tier.** Until that doc is updated it disagrees with this code. Update the doc, don't revert the code. (The doc is also internally inconsistent on Basic — its phase matrix and PH note still name the retired tier.)

**PH reality:** nearly every PH deployment is Pro with no doors and no cameras. Kisi hardware, NVRs and security cameras aren't stocked locally and ship from US/HK — that lead-time cost now attaches to `kisi_doors > 0 || security_cameras > 0` and to the Autonomous tiers, not to a tier label.

## Don't invent quantities the source defers

The spreadsheet marks some quantities `"TBD"` on purpose. Reproduce the TBD; don't derive a plausible number. Currently: **security camera junction box** (`IF(Z13=0,0,"TBD")` — not `= security_cameras`; the *replay* junction box genuinely is `= courts`, and both being a `PFA130-E` is what invites the mistake), **iPad fence bracket** for non-Pickleball-Kingdom brands, and **access points** for all PodPlay venues. A fabricated quantity reads as authoritative on a printed BOM.

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
