import { describe, it, expect } from 'vitest'
import type { Item } from '@/calculator/types'
import type { RoleKey } from '@/calculator/roleKeys'
import { resolveCatalog, multiOptionRoles } from './resolveCatalog'

const item = (over: Partial<Item> & { id: string }): Item => ({
  name: over.id, category: 'camera', roleKey: 'replay_camera',
  supplier: null, poeWatts: null, mainsWatts: null, rackU: null,
  isActive: true, isDefault: false, notes: null, printNote: null,
  ...over,
})

const uniview = item({ id: 'uni', name: 'Uniview', isDefault: true })
const dahua = item({ id: 'dah', name: 'Dahua' })
const choice = (itemId: string, roleKey: RoleKey = 'replay_camera') =>
  [{ roleKey, itemId }]

const roleOf = (catalog: Item[], role: RoleKey) =>
  catalog.filter(i => i.isActive && i.roleKey === role)

describe('resolveCatalog', () => {
  // The whole point of the feature: the venue's pick beats the catalog's
  // default, so Helios Beta can be sized on the Dahua while Tela Park is not.
  it('lets the venue\'s explicit choice win over the default', () => {
    const r = resolveCatalog([uniview, dahua], choice('dah'))
    expect(roleOf(r.catalog, 'replay_camera').map(i => i.id)).toEqual(['dah'])
    expect(r.warnings).toEqual([])
  })

  // The display path keeps the WHOLE catalog and reads the winner from here.
  // Without this map, MaterialsTable and exportMaterialsPdf would have to be
  // handed the collapsed array — which would hide the alternate from the swap
  // control and misname any line already pointing at it.
  it('reports the winning item id per role rather than only filtering', () => {
    const r = resolveCatalog([uniview, dahua], choice('dah'))
    expect(r.chosen.get('replay_camera')).toBe('dah')
  })

  it('reports no winner for a role that resolved to nothing', () => {
    const r = resolveCatalog([{ ...uniview, isDefault: false }, dahua], [])
    expect(r.chosen.has('replay_camera')).toBe(false)
  })

  // A venue that has not chosen behaves exactly as it does today.
  it('falls back to the role\'s default when the venue has not chosen', () => {
    const r = resolveCatalog([uniview, dahua], [])
    expect(roleOf(r.catalog, 'replay_camera').map(i => i.id)).toEqual(['uni'])
    expect(r.warnings).toEqual([])
  })

  // Today's catalog: one active item per role and no default flag set anywhere
  // is still resolvable, so the migration's backfill is a convenience rather
  // than a load-bearing precondition.
  it('falls back to the sole active item when no default is set', () => {
    const r = resolveCatalog([{ ...uniview, isDefault: false }], [])
    expect(roleOf(r.catalog, 'replay_camera').map(i => i.id)).toEqual(['uni'])
    expect(r.warnings).toEqual([])
  })

  // A deactivated part must not be specced onto a fresh BOM — but substituting
  // SILENTLY is the exact failure this feature exists to remove, so it speaks.
  it('substitutes and reports when the chosen item was deactivated', () => {
    const dead = { ...dahua, isActive: false }
    const r = resolveCatalog([uniview, dead], choice('dah'))
    expect(roleOf(r.catalog, 'replay_camera').map(i => i.id)).toEqual(['uni'])
    const w = r.warnings.find(x => x.code === 'CHOICE_UNAVAILABLE')
    expect(w).toBeDefined()
    // Both names, or the reader cannot tell what they lost or what they got.
    expect(w!.message).toContain('Dahua')
    expect(w!.message).toContain('Uniview')
  })

  // An item's role_key can be reassigned while it stays active — 0010 was the
  // proof the two move independently — and a stale choice would otherwise
  // inject that item into a role it no longer fills.
  it('substitutes and reports when the chosen item no longer holds the role', () => {
    const moved = { ...dahua, roleKey: 'security_camera' as RoleKey }
    const r = resolveCatalog([uniview, moved], choice('dah'))
    expect(roleOf(r.catalog, 'replay_camera').map(i => i.id)).toEqual(['uni'])
    expect(r.warnings.map(w => w.code)).toContain('CHOICE_UNAVAILABLE')
  })

  // The dropped guarantee from §3. The role resolves to NOTHING rather than to
  // an arbitrary one of the two, because picking arbitrarily is what the old
  // find/Map split did and it disagreed with itself across call sites.
  it('reports ROLE_NO_DEFAULT and resolves nothing when several actives have no default', () => {
    const r = resolveCatalog([{ ...uniview, isDefault: false }, dahua], [])
    expect(roleOf(r.catalog, 'replay_camera')).toEqual([])
    const w = r.warnings.find(x => x.code === 'ROLE_NO_DEFAULT')
    expect(w).toBeDefined()
    expect(w!.message).toContain('Replay camera')
  })

  // Both at once: the venue's pick is gone AND there is no default to fall
  // back to. Reporting only ROLE_NO_DEFAULT would tell an admin to set a
  // default and never tell the venue's owner that their pick vanished — and
  // the save path preserves that pick, so it is not lost, only unexplained.
  it('reports the dead choice even when there is no substitute', () => {
    const dead = { ...dahua, isActive: false }
    const third = item({ id: 'third', name: 'EmpireTech' })
    const r = resolveCatalog(
      [{ ...uniview, isDefault: false }, third, dead], choice('dah'),
    )
    expect(r.warnings.map(w => w.code).sort())
      .toEqual(['CHOICE_UNAVAILABLE', 'ROLE_NO_DEFAULT'])
    expect(r.warnings.find(w => w.code === 'CHOICE_UNAVAILABLE')!.message)
      .toContain('Dahua')
  })

  // VenueDetail resolves catalogAll and derives the active-only catalog from
  // it, so a resolution that dropped inactive items would blank the names of
  // every saved line whose item was later deactivated.
  it('passes inactive items through untouched', () => {
    const retired = item({ id: 'kstar', roleKey: null, isActive: false })
    const r = resolveCatalog([uniview, dahua, retired], choice('dah'))
    expect(r.catalog.map(i => i.id).sort()).toEqual(['dah', 'kstar'].sort())
  })

  // Items with no role key are not part of any role and must survive too.
  it('passes active items with no role key through untouched', () => {
    const loose = item({ id: 'loose', roleKey: null })
    const r = resolveCatalog([uniview, loose], [])
    expect(r.catalog.map(i => i.id)).toContain('loose')
  })
})

describe('multiOptionRoles', () => {
  // This is what decides whether a picker renders at all. On today's catalog
  // it must be empty, or the Hardware group appears on every venue offering a
  // choice of one.
  it('is empty when every role has a single active item', () => {
    expect(multiOptionRoles([uniview]).size).toBe(0)
  })

  it('lists a role once it has two active items', () => {
    const roles = multiOptionRoles([uniview, dahua])
    expect([...roles.keys()]).toEqual(['replay_camera'])
    expect(roles.get('replay_camera')!.map(i => i.id)).toEqual(['dah', 'uni'])
  })

  // Deactivated twins are not options.
  it('ignores inactive items', () => {
    expect(multiOptionRoles([uniview, { ...dahua, isActive: false }]).size).toBe(0)
  })
})
