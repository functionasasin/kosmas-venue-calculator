import type { Item } from './types'
import { ROLE_KEYS } from './roleKeys'

/**
 * A complete catalog for tests: one item per role key, with the rack U and
 * PoE watts the sizing doc specifies. Not used in production.
 */
const RACK_U: Record<string, number> = {
  mac_mini_shelf: 2, mac_mini: 0, ups: 2,
  patch_panel_24: 1, patch_panel_48: 1,
  switch_24_pro: 1, switch_24_std: 1, switch_48_pro: 1,
  gateway_udm_se: 1, gateway_udm_pro: 1,
}

const POE_WATTS: Record<string, number> = {
  replay_camera: 17.5, security_camera: 17.5, ipad_poe_adapter: 13,
  access_point: 13, kisi_reader: 7,
}

export const testCatalog: Item[] = ROLE_KEYS.map(roleKey => ({
  id: roleKey,
  name: roleKey,
  category: 'test',
  roleKey,
  supplier: null,
  poeWatts: POE_WATTS[roleKey] ?? null,
  rackU: RACK_U[roleKey] ?? 0,
  isActive: true,
  notes: null,
  printNote: null,
}))
