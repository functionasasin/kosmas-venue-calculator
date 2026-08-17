import type { VenueInputs, CalculatedLine } from './types'
import type { RoleKey } from './roleKeys'

// venue-sizing.md § Per-court AV + kiosk quantities, § Replay camera +
// junction box, § iPad PoE adapter quantity — all scale 1:1 with courts.
const PER_COURT: RoleKey[] = [
  'replay_camera',
  'ipad', 'ipad_poe_adapter', 'ipad_wall_mount',
  'apple_tv',
  'display',
]

export function planPerCourt(inputs: VenueInputs): CalculatedLine[] {
  const { courts, securityCameras } = inputs
  const lines: CalculatedLine[] = PER_COURT.map(roleKey => ({
    roleKey,
    qty: courts,
    formula: `1 per court (${courts})`,
  }))

  // venue-sizing.md § Flic Button quantity — the +2 is a venue-level spare.
  lines.push({
    roleKey: 'flic',
    qty: courts * 2 + 2,
    formula: `(${courts} × 2) + 2`,
  })

  // venue-sizing.md § Replay signage quantity
  lines.push({
    roleKey: 'signage',
    qty: courts * 2,
    formula: `${courts} × 2`,
  })

  // venue-sizing.md § Mac mini + shelf quantity — one per venue, not scaled.
  lines.push({ roleKey: 'mac_mini', qty: 1, formula: '1 per venue' })
  lines.push({ roleKey: 'mac_mini_shelf', qty: 1, formula: '1 per venue' })

  // venue-sizing.md § Replay camera + junction box — the camera is quantified
  // directly. Its PFA130-E junction box is out of scope for Kosmas and is not
  // emitted; the source's deferred TBD line went with it.
  if (securityCameras > 0) {
    lines.push({
      roleKey: 'security_camera',
      qty: securityCameras,
      formula: `${securityCameras} specified`,
    })
  }

  // venue-sizing.md § Wi-Fi access point quantity — the doc states AP count
  // is a coverage decision that "must be authored fresh", so the line is TBD
  // rather than absent. An omitted line is how Tela Park's 3 U7-LR went
  // missing from a formula-derived list.
  lines.push({
    roleKey: 'access_point',
    qty: 'TBD',
    formula: 'coverage survey — not derivable',
  })

  // The iPad fence bracket (source row 46) was emitted here as a TBD line until
  // 2026-08-17. It is now folded into `ipad_wall_mount` above — the locking wall
  // mount kit ships with the fence/pole hardware, so a separate line double-buys.
  // That is a fact about the SKU Kosmas buys, not about the source, which sizes
  // the bracket 1/court for Pickleball Kingdom; if the mount SKU changes, re-check
  // whether the hardware is still included. See venue-sizing.md § Per-court AV +
  // kiosk quantities, which preserves the original formula.

  return lines
}
