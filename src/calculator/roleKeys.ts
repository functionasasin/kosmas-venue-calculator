// Stable identifiers the sizing formulas target. The catalog maps each to a
// concrete SKU, so swapping hardware is a data edit rather than a code change.
export const ROLE_KEYS = [
  // Mounting hardware is deliberately absent — junction boxes (PFA130-E, both
  // the replay `= courts` line and the deferred security one), the Apple TV
  // mount and the display tilt mount were all removed on 2026-08-11 as out of
  // scope for Kosmas. The source sizes each at 1 per court; we do not spec
  // them. A role key with no item behind it renders an explicit "no item
  // mapped" row, so the key has to go with the item, not just the item.
  'replay_camera',
  'security_camera',
  // ipad_wall_mount covers the fence/pole case too — the kit includes that
  // hardware, so `ipad_fence_bracket` was removed on 2026-08-17.
  'ipad', 'ipad_poe_adapter', 'ipad_wall_mount',
  'apple_tv', 'display',
  'switch_24_pro', 'switch_24_std', 'switch_48_pro',
  'gateway_udm_se', 'gateway_udm_pro',
  'access_point',
  // Autonomous tiers only, and what makes them Autonomous. The controller is
  // rack-side on the UDM (1 per 4 doors); the reader is 1 per door. The
  // push-to-exit / REX device deliberately has NO role key: it applies to
  // mag-lock doors only, the tool has no input for door style, and no quantity
  // for it exists anywhere in the source — `Cost Analysis` has no REX row at
  // all. It stays a manual line raised by a warning.
  'kisi_controller', 'kisi_reader',
  'mac_mini', 'mac_mini_shelf',
  'replay_ssd_1tb', 'replay_ssd_2tb', 'replay_ssd_4tb',
  'patch_panel_24', 'patch_panel_48',
  'cat6_0m5', 'cat6_1m', 'cat6_3m',
  'ups',
  'rack_12u', 'rack_16u', 'rack_21u', 'rack_27u',
  'flic', 'signage',
] as const

export type RoleKey = (typeof ROLE_KEYS)[number]

/**
 * `items.role_key` and `venue_lines.origin_role_key` are plain `text` with no
 * check constraint, so the database can hand back anything — including a role
 * retired by a later release, which is exactly what happened to the junction
 * boxes and the HDMI cable. Narrowing to null keeps the `RoleKey` type honest;
 * an unrecognised key was already inert (it matches no formula), and null is
 * the case every consumer already handles. Mirrors `readTier` in data/venues.ts.
 */
export const readRoleKey = (v: string | null | undefined): RoleKey | null =>
  v != null && (ROLE_KEYS as readonly string[]).includes(v) ? (v as RoleKey) : null
