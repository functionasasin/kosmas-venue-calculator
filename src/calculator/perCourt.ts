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

  // venue-sizing.md § Per-court AV + kiosk quantities — the source auto-sizes
  // the fence bracket for Pickleball Kingdom venues only and defers every other
  // brand. Kosmas builds none of those, so it is always deferred here; the
  // locking wall mount above is the default kiosk mount.
  lines.push(
    {
      roleKey: 'ipad_fence_bracket',
      qty: 'TBD',
      formula: 'specify mount manually',
    },
  )

  return lines
}
