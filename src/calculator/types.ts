import type { RoleKey } from './roleKeys'

// tiers-reference.md § Basic is retired (2026-08-10) — Basic+ covers the entry
// case and is now the lowest tier. Legacy 'basic' rows are read as 'basic_plus'
// in data/venues.ts. Don't reintroduce it.
//
// Pro+ IS distinct from Pro and must stay so. The capabilities matrix gives Pro
// Door Access "No" and Remote Monitoring "No"; Pro+ gets "Partial / Custom" and
// "Optional". Folding Pro+ into Pro was tried on 2026-08-10 and reverted: it is
// true that no sizing module reads `tier`, but the gates in gates.ts do, and
// those gates are what the tier means. Merging them let a Pro venue be specced
// with the very door access and cameras that define it as not-Pro.
export type Tier =
  | 'basic_plus' | 'pro' | 'pro_plus'
  | 'autonomous' | 'autonomous_plus'

export type Brand = 'podplay' | 'pingpod' | 'pickleball_kingdom'

export interface VenueInputs {
  courts: number
  tier: Tier
  securityCameras: number
  kisiDoors: number
  brand: Brand
  extendedRetention: boolean
}

export interface Item {
  id: string
  name: string
  category: string
  roleKey: RoleKey | null
  supplier: string | null
  /** Maximum PoE draw in watts, not typical. venue-sizing.md § Replay camera */
  poeWatts: number | null
  rackU: number | null
  unitPrice: number | null
  currency: string | null
  isActive: boolean
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
