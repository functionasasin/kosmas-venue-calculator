import type { RoleKey } from './roleKeys'

// tiers-reference.md § lineup confirmed 2026-08-11. Five tiers, in order.
//
// Basic and Basic+ differ only in software — Basic is the booking website,
// Basic+ adds a cross-platform owner app — so neither has hardware for this
// tool to size and both are blocked in gates.ts. A 2026-08-10 change retired
// Basic outright; that was wrong about the lineup and has been undone.
//
// There is no Pro+. It was recorded as sitting between Pro and Autonomous with
// "Partial / Custom" door access, and was removed on 2026-08-11. Door access
// now starts at Autonomous and cameras remain Autonomous+ only, so a venue
// wanting any Kisi door is Autonomous — there is no partial configuration.
export type Tier =
  | 'basic' | 'basic_plus' | 'pro'
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
