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
  // `switch_24_std` is the non-Pro USW-24-POE that `Cost Analysis!D7` selects
  // below 4 courts. It only ever reaches a BOM on a 2-3 court Pro venue — 1
  // court gets no switch at all, the gates block Basic and Basic+ outright,
  // and an Autonomous tier needs at least one door, which forces the Pro
  // switch. Kept deliberately (2026-08-20) so the smallest venues are not
  // over-spec'd into a $699 switch.
  //
  // ⚠️ It carries a 95W PoE budget, NOT the Pro's 400W. See poe.ts — treating
  // the two as one budget put a 3-court venue at 96% of its switch and
  // reported 23%.
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
  // venue-sizing.md § VA sizing by court count — the UPS is specified by
  // RATING, not by SKU, so there is a role key per rung of the PH market
  // ladder. The KSTAR MP RT 3K S is still the unit Kosmas stocks; it is simply
  // no longer what the tool asks for, because the requirement is what a vendor
  // quotes against and every venue below 16 courts needs far less than 3000VA.
  'ups_750va', 'ups_1000va', 'ups_1500va', 'ups_2000va', 'ups_3000va',
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
