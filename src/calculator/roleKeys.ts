// Stable identifiers the sizing formulas target. The catalog maps each to a
// concrete SKU, so swapping hardware is a data edit rather than a code change.
export const ROLE_KEYS = [
  'replay_camera', 'junction_box',
  'security_camera', 'security_junction_box',
  'ipad', 'ipad_poe_adapter', 'ipad_wall_mount', 'ipad_fence_bracket',
  'apple_tv', 'apple_tv_mount', 'hdmi_cable', 'display', 'tilt_mount',
  'switch_24_pro', 'switch_24_std', 'switch_48_pro',
  'gateway_udm_se', 'gateway_udm_pro',
  'access_point',
  'mac_mini', 'mac_mini_shelf',
  'replay_ssd_1tb', 'replay_ssd_2tb', 'replay_ssd_4tb',
  'patch_panel_24', 'patch_panel_48',
  'cat6_0m5', 'cat6_1m', 'cat6_3m',
  'ups', 'c14_adapter',
  'rack_12u', 'rack_16u', 'rack_21u', 'rack_27u',
  'flic', 'signage',
] as const

export type RoleKey = (typeof ROLE_KEYS)[number]
