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

/**
 * Human labels for the role keys. Read by the venue's hardware pickers, by the
 * recalculation diff and by the staleness dialog — every place a role key used
 * to be shown raw.
 *
 * Kept beside ROLE_KEYS rather than in src/lib so the two cannot drift: the
 * Record<RoleKey, string> type fails the build the moment a role key is added
 * without a label.
 */
export const ROLE_LABELS: Record<RoleKey, string> = {
  replay_camera: 'Replay camera',
  security_camera: 'Security camera',
  ipad: 'iPad',
  ipad_poe_adapter: 'iPad PoE adapter',
  ipad_wall_mount: 'iPad wall mount',
  apple_tv: 'Apple TV',
  display: 'Display',
  switch_24_pro: '24-port PoE switch (Pro)',
  switch_24_std: '24-port PoE switch (standard)',
  switch_48_pro: '48-port PoE switch (Pro)',
  gateway_udm_se: 'Gateway (UDM-SE)',
  gateway_udm_pro: 'Gateway (UDM-Pro)',
  access_point: 'Access point',
  kisi_controller: 'Kisi controller',
  kisi_reader: 'Kisi reader',
  mac_mini: 'Mac mini',
  mac_mini_shelf: 'Mac mini rack shelf',
  replay_ssd_1tb: 'Replay SSD 1TB',
  replay_ssd_2tb: 'Replay SSD 2TB',
  replay_ssd_4tb: 'Replay SSD 4TB',
  patch_panel_24: '24-port patch panel',
  patch_panel_48: '48-port patch panel',
  cat6_0m5: 'Cat6 patch cable 0.5m',
  cat6_1m: 'Cat6 patch cable 1m',
  cat6_3m: 'Cat6 patch cable 3m',
  ups_750va: 'UPS 750 VA',
  ups_1000va: 'UPS 1000 VA',
  ups_1500va: 'UPS 1500 VA',
  ups_2000va: 'UPS 2000 VA',
  ups_3000va: 'UPS 3000 VA',
  rack_12u: '12U rack',
  rack_16u: '16U rack',
  rack_21u: '21U rack',
  rack_27u: '27U rack',
  flic: 'Flic button',
  signage: 'Signage',
}

/**
 * The set of role keys a BOM line may be swapped between — the variants of one
 * piece of hardware. Coarser than a role key (each UPS rung and each rack
 * height is its own role, and they are obviously interchangeable) and finer
 * than the section a line renders in (`sections.ts` folds rack, compute,
 * storage, power and network into one `Rack` band, which is why the UDM line
 * used to offer patch panels, an SSD and five UPS rungs).
 *
 * Families are named for the FUNCTION, never for the SKU that fills it today.
 * `ipad` maps to `tablet` and `apple_tv` to `media_player` so that the day an
 * Android tablet or a non-Apple player is stocked, it joins an accurately named
 * group instead of one named after the thing it replaces. The string is a
 * grouping key and is never rendered, so a functional name costs nothing now
 * and saves a rename later.
 *
 * Two ways hardware gets added, and only the second one reaches this file:
 *
 *   1. Another SKU on an EXISTING role key — a second display, an M4 Pro Mac
 *      mini. Nothing here changes. Activate the item and the swap picker and
 *      venue_item_choices pick it up, which is the machinery 0011-0014 built
 *      for the two replay cameras.
 *   2. A new KIND of thing, which needs its own role key because the formulas
 *      have to size it — an Android tablet draws differently and takes a
 *      different mount. That starts in podplay-ph-venue-sizing.md, not here.
 *
 * Record<RoleKey, string> is the enforcement: a role key added without a
 * family fails the build, exactly as ROLE_LABELS above intends.
 *
 * Note that a swap BETWEEN two role keys in one family (a UPS rung to another
 * rung, an iPad to a hypothetical Android tablet) is a manual per-line
 * override, not a re-size — MaterialsTable.swap stamps originRoleKey and marks
 * the line manual, which exempts it from recalculation. A swap that stays
 * INSIDE one role key is the opposite: swap() records it as the venue's choice
 * and the formulas re-size on it. Same control, and the family is what decides
 * which options are even offered, not which of the two a pick turns out to be.
 */
export const ROLE_FAMILY: Record<RoleKey, string> = {
  replay_camera: 'replay_camera',
  security_camera: 'security_camera',
  ipad: 'tablet',
  ipad_poe_adapter: 'poe_adapter',
  ipad_wall_mount: 'tablet_mount',
  apple_tv: 'media_player',
  display: 'display',
  switch_24_pro: 'switch',
  switch_24_std: 'switch',
  switch_48_pro: 'switch',
  gateway_udm_se: 'gateway',
  gateway_udm_pro: 'gateway',
  access_point: 'access_point',
  kisi_controller: 'access_controller',
  kisi_reader: 'access_reader',
  mac_mini: 'server',
  mac_mini_shelf: 'rack_shelf',
  replay_ssd_1tb: 'replay_storage',
  replay_ssd_2tb: 'replay_storage',
  replay_ssd_4tb: 'replay_storage',
  patch_panel_24: 'patch_panel',
  patch_panel_48: 'patch_panel',
  cat6_0m5: 'patch_cable',
  cat6_1m: 'patch_cable',
  cat6_3m: 'patch_cable',
  ups_750va: 'ups',
  ups_1000va: 'ups',
  ups_1500va: 'ups',
  ups_2000va: 'ups',
  ups_3000va: 'ups',
  rack_12u: 'rack',
  rack_16u: 'rack',
  rack_21u: 'rack',
  rack_27u: 'rack',
  flic: 'button',
  signage: 'signage',
}

/**
 * The family a role key belongs to, or null when there is none to speak of.
 *
 * Null covers both cases readRoleKey above already describes — no role key at
 * all, and a key the database still holds but ROLE_KEYS no longer does. Callers
 * read null as "no family", which is what routes a line to the whole-catalog
 * fallback in swapOptionsFor rather than to an empty picker.
 */
export const familyOf = (roleKey: string | null | undefined): string | null => {
  const role = readRoleKey(roleKey)
  return role ? ROLE_FAMILY[role] : null
}
