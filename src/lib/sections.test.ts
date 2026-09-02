import { describe, it, expect } from 'vitest'
import type { Item } from '@/calculator/types'
import type { RoleKey } from '@/calculator/roleKeys'
import type { StoredLine } from '@/data/venueLines'
import {
  catalogIndex, groupIntoSections, itemsByRole, sectionForItem, swapOptionsFor,
} from './sections'

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
    groupIntoSections(lines, itemsByRole(catalog)).map(s => [s.id, s.lines.length]),
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
    const total = groupIntoSections(proPodPlay8, itemsByRole(catalog))
      .reduce((n, s) => n + s.lines.length, 0)
    expect(total).toBe(20)
  })

  it('orders sections rack, court, cabling, decide', () => {
    expect(groupIntoSections(proPodPlay8, itemsByRole(catalog)).map(s => s.id))
      .toEqual(['rack', 'court', 'cabling', 'decide'])
  })

  // Array order is emission order. sortOrder is 0 on every freshly merged
  // line, so sorting by it would scramble an unsaved venue.
  it('keeps array order inside a section', () => {
    const rack = groupIntoSections(proPodPlay8, itemsByRole(catalog))
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
    const decide = groupIntoSections(proPodPlay8, itemsByRole(catalog))
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
    const grouped = groupIntoSections([line('flic', 18)], itemsByRole(odd))
    expect(grouped.map(s => s.id)).toEqual(['decide'])
  })

  it('sends a line with no resolvable item to decide', () => {
    const grouped = groupIntoSections([line('security_camera', 4)], itemsByRole(catalog))
    expect(grouped.map(s => s.id)).toEqual(['decide'])
  })
})

describe('empty sections', () => {
  it('omits a section with no lines rather than rendering it empty', () => {
    const grouped = groupIntoSections([line('ups_1500va', 1)], itemsByRole(catalog))
    expect(grouped.map(s => s.id)).toEqual(['rack'])
  })

  it('returns nothing for a venue with no lines', () => {
    expect(groupIntoSections([], itemsByRole(catalog))).toEqual([])
  })
})

describe('swap options', () => {
  // The shared catalog holds one item per role, so it cannot express a family.
  // These extras give a second member to the two families the tests below
  // actually assert on — ups and gateway — plus the two-active-items-on-one-role
  // case the replay camera actually is. The rack and switch families stay at one
  // member each on purpose: the shared catalog's rack_12u and switch_24_pro are
  // what the exhaustive toEqual assertions below exclude, and a second SKU in
  // either family would be a fixture row no assertion reaches.
  const extra: Item[] = [
    item('ups_750va', 'power'), item('ups_3000va', 'power'),
    item('gateway_udm_se', 'network'),
    item('security_camera', 'camera'),
    { ...item('replay_camera', 'camera'), id: 'id-replay_camera-2' },
    { ...item('access_point', 'network'), id: 'id-access_point-2' },
    { ...item('display', 'court'), id: 'id-display-2' },
  ]
  const fam = [...catalog, ...extra]
  const roles = (opts: Item[]) => opts.map(i => i.roleKey)

  // The complaint this filter exists for: every one of these used to be
  // offered on the UPS line, because sections.ts folds power, network,
  // compute, storage and rack into one Rack band.
  it('offers a UPS line the other rungs and nothing else', () => {
    const options = swapOptionsFor(line('ups_1500va', 1), catalogIndex(fam))
    expect(roles(options).sort()).toEqual(['ups_1500va', 'ups_3000va', 'ups_750va'])
    expect(roles(options)).not.toContain('mac_mini')
    expect(roles(options)).not.toContain('rack_12u')
    expect(roles(options)).not.toContain('gateway_udm_pro')
  })

  // A gateway and a switch are both `network` items in the same section, and
  // neither is a substitute for the other.
  it('offers a gateway line the other gateway and no switches', () => {
    const options = swapOptionsFor(line('gateway_udm_pro', 1), catalogIndex(fam))
    expect(roles(options).sort()).toEqual(['gateway_udm_pro', 'gateway_udm_se'])
  })

  // Two roles, one category. A replay camera is not swappable for the
  // surveillance camera that only Autonomous+ carries — see CLAUDE.md on why
  // those two tiers are not interchangeable.
  it('keeps replay and security cameras in separate families', () => {
    const options = swapOptionsFor(line('replay_camera', 8), catalogIndex(fam))
    expect(options.map(i => i.id).sort())
      .toEqual(['id-replay_camera', 'id-replay_camera-2'])
    expect(roles(options)).not.toContain('security_camera')
  })

  // A TBD line lives in `decide`, but its swap options come from its item's
  // family — otherwise a TBD access point could only be swapped for the other
  // TBD line.
  it('constrains a TBD line by its item\u2019s family, not by decide', () => {
    const options = swapOptionsFor(line('access_point', 'TBD'), catalogIndex(fam))
    expect(options.map(i => i.id).sort())
      .toEqual(['id-access_point', 'id-access_point-2'])
  })

  // Deactivating a family-mate, not an unrelated item: with the family filter
  // an unrelated item is already excluded, so the old catalog-wide version of
  // this test would have passed without isActive being consulted at all.
  it('excludes deactivated items', () => {
    const withDead = fam.map(i =>
      i.id === 'id-display-2' ? { ...i, isActive: false } : i)
    const options = swapOptionsFor(line('display', 8), catalogIndex(withDead))
    expect(options.map(i => i.id)).toEqual(['id-display'])
  })

  // The same rule as the no-family fallback below, and the case that is easy
  // to miss: itemsByRole ignores isActive, so a role whose every item was
  // deactivated still HAS a family — an empty one. Narrowing to it would leave
  // the row saying "No active item mapped" with a picker holding nothing to
  // repair it with.
  it('offers the whole active catalog when the family has no active member', () => {
    const allDead = fam.map(i =>
      i.roleKey === 'replay_camera' ? { ...i, isActive: false } : i)
    const options = swapOptionsFor(line('replay_camera', 8), catalogIndex(allDead))
    expect(options.length).toBe(fam.length - 2)
    expect(roles(options)).toContain('display')
  })

  // Swapping is how "No active item mapped for \u2026" gets repaired. Constraining
  // an unresolvable line to its own family would offer it nothing at all and
  // make the error permanent. Uses the shared catalog, which has no
  // security_camera item for the line to resolve to.
  it('offers the whole active catalog to a line with no resolvable item', () => {
    const options = swapOptionsFor(line('security_camera', 4), catalogIndex(catalog))
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
