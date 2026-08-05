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

## The 6-tier model

`Tier` is `basic | basic_plus | pro | pro_plus | autonomous | autonomous_plus`. Full definitions in `podplay-tiers-reference.md`; what matters when writing formulas:

| Tier | Rack | Court-side | In this tool |
|---|---|---|---|
| Basic / Basic+ | none | BBPOS terminals only | blocked — nothing to size |
| Pro | Mac mini · UDM · USW-Pro · UPS · patch panel | display · iPad · Apple TV · replay cam · PoE adapter · Flic | fully covered |
| Pro+ | Pro + partial Kisi + optional NVR | Pro + optional readers/cameras | computed as a starting point |
| Autonomous | Pro + Kisi Controller Pro 2 (1 per 4 doors), **no NVR** | Pro + Reader Pro 2.1/door + push-to-exit on mag-lock doors, **no security cameras** | Kisi kit added by hand |
| Autonomous+ | Autonomous + UNVR/UNVR-Pro + 8TB HDDs | Autonomous + EmpireTech PoE cameras + PFA130-E boxes | Kisi kit, NVR, HDDs added by hand |

**Autonomous and Autonomous+ are not interchangeable.** The boundary is surveillance: Autonomous is access control only. A warning that tells an Autonomous venue it's missing an NVR is wrong. `security_cameras > 0` is valid on Autonomous+ / Pro+ only; `kisi_doors > 0` on Autonomous / Autonomous+ / Pro+.

**Basic and Basic+ are hardware-identical** — the difference is software (web app vs native iOS/Android). Don't word the block as though Basic+ adds hardware.

**On tier semantics, `podplay-tiers-reference.md` outranks the sizing doc.** The sizing doc is the authority for *sizing*; for what a tier includes the order is co-founder tier definitions → spreadsheet hardware gating → other PodPlay docs. PodPlay's own materials disagree with each other, and the tiers doc is the resolution. Pro+ isn't in the calculation spreadsheet at all, which is why it has no formula-driven BOM.

**PH reality:** nearly every PH deployment is Pro. Kisi hardware, NVRs and security cameras aren't stocked locally and ship from US/HK — non-Pro tiers carry a lead-time cost, not just a scope caveat.

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
