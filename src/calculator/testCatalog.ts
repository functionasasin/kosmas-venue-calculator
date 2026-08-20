import type { Item } from './types'
import { ROLE_KEYS } from './roleKeys'

/**
 * A complete catalog for tests: one item per role key, with the rack U and
 * PoE watts the sizing doc specifies. Not used in production.
 */
const RACK_U: Record<string, number> = {
  mac_mini_shelf: 2, mac_mini: 0,
  ups_750va: 2, ups_1000va: 2, ups_1500va: 2, ups_2000va: 2, ups_3000va: 2,
  patch_panel_24: 1, patch_panel_48: 1,
  switch_24_pro: 1, switch_24_std: 1, switch_48_pro: 1,
  gateway_udm_se: 1, gateway_udm_pro: 1,
}

// The replay camera is held at 17.5W on purpose even though production stocks
// cameras from 2.8W to 24W: this is a fixture contract with the sizing doc's
// worked examples, not a claim about what Kosmas installs. The security camera
// is 7W because NO PH SKU has been chosen — it is the doc's planning figure for
// the 802.3af class, and the cameras named in the docs are all REPLAY cameras.
const POE_WATTS: Record<string, number> = {
  replay_camera: 17.5, security_camera: 7, ipad_poe_adapter: 13,
  access_point: 13, kisi_reader: 7,
}

// venue-sizing.md § Per-line wattages. Verified against the manufacturers:
// UDM-SE and USW-Pro-24-PoE are 50W excluding PoE, USW-Pro-48-PoE is 60W, and
// the M4 Mac mini is 65W max per Apple's own table (support.apple.com/103253) —
// NOT the 30W the source spreadsheet carries, which is a light-load figure.
const MAINS_WATTS: Record<string, number> = {
  gateway_udm_se: 50, gateway_udm_pro: 50,
  switch_24_pro: 50, switch_24_std: 25, switch_48_pro: 60,
  mac_mini: 65, kisi_controller: 20,
}

export const testCatalog: Item[] = ROLE_KEYS.map(roleKey => ({
  id: roleKey,
  name: roleKey,
  category: 'test',
  roleKey,
  supplier: null,
  poeWatts: POE_WATTS[roleKey] ?? null,
  mainsWatts: MAINS_WATTS[roleKey] ?? null,
  rackU: RACK_U[roleKey] ?? 0,
  isActive: true,
  notes: null,
  printNote: null,
}))
