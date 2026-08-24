import type { RoleKey } from './roleKeys'

// tiers-reference.md § lineup confirmed 2026-08-11. Five tiers, in order.
//
// Basic and Basic+ differ only in software — Basic is the booking website
// alone, Basic+ adds the venue its own booking app on iOS and Android — so
// neither has hardware for this tool to size and both are blocked in gates.ts.
// A 2026-08-10 change retired Basic outright; that was wrong about the lineup
// and has been undone.
//
// There is no Pro+. It was recorded as sitting between Pro and Autonomous with
// "Partial / Custom" door access, and was removed on 2026-08-11. Door access
// now starts at Autonomous and cameras remain Autonomous+ only, so a venue
// wanting any Kisi door is Autonomous — there is no partial configuration.
export type Tier =
  | 'basic' | 'basic_plus' | 'pro'
  | 'autonomous' | 'autonomous_plus'

// There is no `brand` input. The source spreadsheet gates five rules on the
// venue operator's brand (PodPlay / PingPod / Pickleball Kingdom), but Kosmas
// deploys only the first — venue-sizing.md § Camera color says outright that
// "KOSMAS / PodPlay venues" are one and the same for these purposes. Offering
// the other two put two values in the picker that either blocked the
// calculation outright (PingPod) or described venues we do not build.
//
// Removing it changes no output: the fence bracket was already TBD for every
// non-Pickleball-Kingdom venue, signage and access points never varied, and the
// PingPod-only hardware rows were never emitted. `venues.brand` stays in the
// schema as `not null default 'podplay'`, which is what a Kosmas venue is.
export interface VenueInputs {
  courts: number
  tier: Tier
  securityCameras: number
  kisiDoors: number
  extendedRetention: boolean
  /**
   * A second WAN uplink on the UDM. Costs one of the gateway's 8 RJ45 ports,
   * which matters only on the Kisi tiers: it is one fewer port for a reader,
   * and at the margin that is what pushes a venue from a 24-port switch to a
   * 48-port. Inert everywhere else. venue-sizing.md § Kisi port accounting.
   */
  backupInternet: boolean
}

export interface Item {
  id: string
  name: string
  category: string
  roleKey: RoleKey | null
  supplier: string | null
  /** Maximum PoE draw in watts, not typical. venue-sizing.md § Replay camera */
  poeWatts: number | null
  /**
   * Maximum mains draw in watts, excluding any PoE the device itself outputs.
   * The two fields are disjoint on purpose and must never be merged: a switch
   * has BOTH (60W of its own, 600W it hands out), and only the first is charged
   * to the UPS while only the second is charged to the switch's PoE budget.
   *
   * Null means "does not draw mains", which is the normal case — everything
   * court-side reaches power as PoE. venue-sizing.md § Per-line wattages.
   */
  mainsWatts: number | null
  rackU: number | null
  isActive: boolean
  /**
   * This item is what a role key resolves to when a venue has expressed no
   * choice. At most one ACTIVE item per role may carry it (partial index
   * items_role_key_default), but a role may legally have none — that is
   * ROLE_NO_DEFAULT, reported by resolveCatalog rather than guessed at.
   *
   * Deactivating an item clears this, enforced by a trigger in 0011 so the
   * rule holds for raw SQL as well as for the app.
   */
  isDefault: boolean
  /** Internal working notes. Never printed. */
  notes: string | null
  /** Constraints that must travel with the item on the handed-out list. */
  printNote: string | null
}

/** 'TBD' is a real output where the sizing doc declines to give a number. */
export type Qty = number | 'TBD'

export interface CalculatedLine {
  roleKey: RoleKey
  qty: Qty
  /** Human-readable derivation shown on hover, e.g. "(8 × 2) + 2". */
  formula: string
}

export type WarningLevel = 'info' | 'warn' | 'critical' | 'error'

export interface Warning {
  code: string
  level: WarningLevel
  message: string
}

export interface BomResult {
  lines: CalculatedLine[]
  warnings: Warning[]
}

export function isCountable(qty: Qty): qty is number {
  return typeof qty === 'number'
}
