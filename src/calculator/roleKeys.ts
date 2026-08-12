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
  'ipad', 'ipad_poe_adapter', 'ipad_wall_mount', 'ipad_fence_bracket',
  'apple_tv', 'display',
  'switch_24_pro', 'switch_24_std', 'switch_48_pro',
  'gateway_udm_se', 'gateway_udm_pro',
  'access_point',
  'mac_mini', 'mac_mini_shelf',
  'replay_ssd_1tb', 'replay_ssd_2tb', 'replay_ssd_4tb',
  'patch_panel_24', 'patch_panel_48',
  'cat6_0m5', 'cat6_1m', 'cat6_3m',
  'ups',
  'rack_12u', 'rack_16u', 'rack_21u', 'rack_27u',
  'flic', 'signage',
] as const

export type RoleKey = (typeof ROLE_KEYS)[number]
