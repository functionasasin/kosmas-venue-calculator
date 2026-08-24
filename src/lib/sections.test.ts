import { describe, it, expect } from 'vitest'
import type { Item } from '@/calculator/types'
import type { RoleKey } from '@/calculator/roleKeys'
import type { StoredLine } from '@/data/venueLines'
import { groupIntoSections, itemsByRole, sectionForItem, swapOptionsFor } from './sections'

/** Categories mirror supabase/seed/0003_catalog_seed.sql exactly. */
const CATEGORY: Partial<Record<RoleKey, string>> = {
  gateway_udm_pro: 'network', switch_24_pro: 'network',
  patch_panel_24: 'network', access_point: 'network',
  mac_mini: 'compute', mac_mini_shelf: 'compute',
  replay_ssd_2tb: 'storage',
  ups_1500va: 'power',
  rack_12u: 'rack',
  replay_camera: 'camera',
  ipad: 'court', ipad_poe_adapter: 'court', ipad_wall_mount: 'court',
  apple_tv: 'court',
  display: 'court',
  flic: 'accessory', signage: 'signage',
  cat6_0m5: 'cable', cat6_1m: 'cable', cat6_3m: 'cable',
}

const item = (roleKey: RoleKey, category: string): Item => ({
  id: `id-${roleKey}`, name: roleKey, category, roleKey,
  supplier: null, poeWatts: null, mainsWatts: null, rackU: null,
  isActive: true, isDefault: true, notes: null, printNote: null,
})

const catalog: Item[] = Object.entries(CATEGORY).map(
  ([role, category]) => item(role as RoleKey, category),
)

const line = (roleKey: RoleKey | null, qty: StoredLine['qty']): StoredLine => ({
  id: `line-${roleKey}`, venueId: 'v',
  itemId: roleKey ? `id-${roleKey}` : '',
  roleKey, qty, originRoleKey: null, sortOrder: 0,
  source: 'formula', suppressed: false, note: null,
})

// The real emission order for an 8-court Pro PodPlay venue.
const proPodPlay8: StoredLine[] = [
  line('gateway_udm_pro', 1), line('switch_24_pro', 1), line('patch_panel_24', 1),
  line('cat6_0m5', 26), line('cat6_1m', 2), line('cat6_3m', 2),
  line('ups_1500va', 1),
  line('replay_camera', 8),
  line('ipad', 8), line('ipad_poe_adapter', 8), line('ipad_wall_mount', 8),
  line('apple_tv', 8),
  line('display', 8),
  line('flic', 18), line('signage', 16),
  line('mac_mini', 1), line('mac_mini_shelf', 1),
  line('access_point', 'TBD'),
  line('replay_ssd_2tb', 1), line('rack_12u', 1),
]

const counts = (lines: StoredLine[]) =>
  Object.fromEntries(
    groupIntoSections(lines, catalog).map(s => [s.id, s.lines.length]),
  )

describe('section assignment', () => {
  // The four counts together are the contract. Getting Rack right while
  // Court-side silently absorbs a cable line would still be wrong.
  // Removed 2026-08-11 as out of scope: the junction box, Apple TV mount and
  // tilt mount, plus the HDMI cable on 2026-08-13 (court-side, 12 -> 8) and the
  // C14 adapter (rack, 9 -> 8). Then the iPad fence bracket on 2026-08-17,
  // folded into the locking wall mount (decide, 2 -> 1) — which leaves the
  // access point as the only line that can land in decide from a formula.
  it('splits an 8-court Pro venue 8 / 8 / 3 / 1', () => {
    expect(counts(proPodPlay8)).toEqual({
      rack: 8, court: 8, cabling: 3, decide: 1,
    })
  })

  it('accounts for all 20 lines', () => {
    const total = groupIntoSections(proPodPlay8, catalog)
      .reduce((n, s) => n + s.lines.length, 0)
    expect(total).toBe(20)
  })

  it('orders sections rack, court, cabling, decide', () => {
    expect(groupIntoSections(proPodPlay8, catalog).map(s => s.id))
      .toEqual(['rack', 'court', 'cabling', 'decide'])
  })

  // Array order is emission order. sortOrder is 0 on every freshly merged
  // line, so sorting by it would scramble an unsaved venue.
  it('keeps array order inside a section', () => {
    const rack = groupIntoSections(proPodPlay8, catalog)
      .find(s => s.id === 'rack')!
    expect(rack.lines.map(l => l.roleKey)).toEqual([
      'gateway_udm_pro', 'switch_24_pro', 'patch_panel_24',
      'ups_1500va', 'mac_mini', 'mac_mini_shelf',
      'replay_ssd_2tb', 'rack_12u',
    ])
  })
})

describe('the three overrides', () => {
  // Without this, TBDs scatter back into their categories and "what is
  // unresolved" stops being a place you can look at.
  it('sends a TBD line to decide even though its category is network', () => {
    expect(sectionForItem(item('access_point', 'network'))).toBe('rack')
    const decide = groupIntoSections(proPodPlay8, catalog)
      .find(s => s.id === 'decide')!
    expect(decide.lines.map(l => l.roleKey).sort())
      .toEqual(['access_point'])
  })

  // category is free text on the item form and defaults to 'uncategorised'.
  // Without a fallback one admin typo makes an item's lines vanish from both
  // the screen and the PDF.
  it('sends an unrecognised category to decide', () => {
    const odd = [...catalog, item('flic', 'uncategorised')]
      .filter(i => i.roleKey !== 'flic' || i.category === 'uncategorised')
    const grouped = groupIntoSections([line('flic', 18)], odd)
    expect(grouped.map(s => s.id)).toEqual(['decide'])
  })

  it('sends a line with no resolvable item to decide', () => {
    const grouped = groupIntoSections([line('security_camera', 4)], catalog)
    expect(grouped.map(s => s.id)).toEqual(['decide'])
  })
})

describe('empty sections', () => {
  it('omits a section with no lines rather than rendering it empty', () => {
    const grouped = groupIntoSections([line('ups_1500va', 1)], catalog)
    expect(grouped.map(s => s.id)).toEqual(['rack'])
  })

  it('returns nothing for a venue with no lines', () => {
    expect(groupIntoSections([], catalog)).toEqual([])
  })
})

describe('swap options', () => {
  // Swapping across sections would re-parent the row mid-edit, unmounting the
  // control and losing focus — and for a user account, swapping into a cable
  // role would make the row vanish outright.
  it('offers only items in the line’s own section', () => {
    const options = swapOptionsFor(line('display', 8), catalog)
    expect(options.every(i => sectionForItem(i) === 'court')).toBe(true)
    expect(options.map(i => i.roleKey)).toContain('ipad')
    expect(options.map(i => i.roleKey)).not.toContain('ups_1500va')
    expect(options.map(i => i.roleKey)).not.toContain('cat6_0m5')
  })

  // A TBD line lives in `decide`, but its swap options come from its item's
  // category — otherwise a TBD access point could only be swapped for the
  // other TBD line.
  it('constrains a TBD line by its item’s category, not by decide', () => {
    const options = swapOptionsFor(line('access_point', 'TBD'), catalog)
    expect(options.map(i => i.roleKey)).toContain('switch_24_pro')
    expect(options.map(i => i.roleKey)).not.toContain('ipad')
  })

  it('excludes deactivated items', () => {
    const withDead = catalog.map(i =>
      i.roleKey === 'ipad' ? { ...i, isActive: false } : i)
    const options = swapOptionsFor(line('display', 8), withDead)
    expect(options.map(i => i.roleKey)).not.toContain('ipad')
  })

  // Swapping is how "No active item mapped for …" gets repaired. Constraining
  // an unresolvable line to its own section would offer it nothing at all and
  // make the error permanent.
  it('offers the whole active catalog to a line with no resolvable item', () => {
    const options = swapOptionsFor(line('security_camera', 4), catalog)
    expect(options.length).toBe(catalog.length)
  })
})

describe('itemsByRole with more than one item on a role', () => {
  const dead = { ...item('replay_camera', 'camera'), id: 'dead', isActive: false }
  const live = { ...item('replay_camera', 'camera'), id: 'live' }
  const other = { ...item('replay_camera', 'camera'), id: 'other' }

  // `new Map` keeps the LAST entry, so an inactive twin returned after the
  // active one would shadow it — and itemsByRole filters on roleKey alone,
  // deliberately, so that a saved line still renders a deactivated item's name.
  it('prefers the active item over a deactivated one on the same role', () => {
    expect(itemsByRole([live, dead]).get('replay_camera')!.id).toBe('live')
    expect(itemsByRole([dead, live]).get('replay_camera')!.id).toBe('live')
  })

  it('still resolves a role whose only item is inactive', () => {
    expect(itemsByRole([dead]).get('replay_camera')!.id).toBe('dead')
  })

  // The venue's resolved choice, not scan order, decides which of two ACTIVE
  // items a role resolves to. Without this the screen and the PDF would pick
  // whichever the query returned last, and could disagree with the UPS rung —
  // the find/Map split the whole design exists to close.
  it('prefers the venue\'s chosen item among several actives', () => {
    const chosen = new Map([['replay_camera', 'other']])
    expect(itemsByRole([live, other], chosen).get('replay_camera')!.id)
      .toBe('other')
    expect(itemsByRole([other, live], chosen).get('replay_camera')!.id)
      .toBe('other')
  })

  // A stale chosen id must not blank the role.
  it('falls back to an active item when the chosen id is not present', () => {
    const chosen = new Map([['replay_camera', 'gone']])
    expect(itemsByRole([live], chosen).get('replay_camera')!.id).toBe('live')
  })
})
