import { describe, it, expect } from 'vitest'
import type { Item } from '@/calculator/types'
import type { RoleKey } from '@/calculator/roleKeys'
import { resolveCatalog, multiOptionRoles, completeChoiceSet } from './resolveCatalog'

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
  // This is what decides which roles a venue pins on save — choicesToSave
  // unions it with the roles already stored. On a catalog where every role has
  // one item it must be empty, or every venue starts writing pins for roles
  // that have nothing to choose between.
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

describe('completeChoiceSet', () => {
  const chosen = (pairs: [RoleKey, string][]) => new Map(pairs)

  // The reason a venue that never touched the picker still gets rows written:
  // pinning the current resolution on first save is what stops a later flip of
  // the catalog default silently re-sizing an already-quoted venue.
  it('pins a contested role the venue never chose to what it resolved to', () => {
    const set = completeChoiceSet(
      [], [uniview, dahua], chosen([['replay_camera', 'uni']]),
    )
    expect(set).toEqual([{ roleKey: 'replay_camera', itemId: 'uni' }])
  })

  // "Has more than one active item" is a CURRENT fact; the pin is a historical
  // one. Deactivate the alternate and the role stops being contested, so a set
  // built from the catalog alone would drop the pin on the next save made for
  // any unrelated reason — and reactivating the alternate later would find the
  // venue silently following the catalog default again.
  it('keeps a stored pin for a role that is no longer contested', () => {
    const set = completeChoiceSet(
      choice('dah'),
      [uniview, { ...dahua, isActive: false }],
      chosen([['replay_camera', 'uni']]),
    )
    expect(set).toEqual([{ roleKey: 'replay_camera', itemId: 'dah' }])
  })

  // resolveCatalog hands back a FALLBACK for a dead pin so the venue can still
  // be sized and displayed while the pick is broken. Writing that fallback back
  // would swap the venue onto the catalog default the moment anything else
  // triggered a save, and reactivating the item later would never undo it.
  it('keeps the stored pin rather than the fallback it resolved to', () => {
    const set = completeChoiceSet(
      choice('dah'), [uniview, dahua], chosen([['replay_camera', 'uni']]),
    )
    expect(set).toEqual([{ roleKey: 'replay_camera', itemId: 'dah' }])
  })

  // ROLE_NO_DEFAULT is an admin problem. Dropping the user's pick while they
  // fix it would be destroying data that cannot be restored.
  it('keeps a stored pin for a role that resolved to nothing', () => {
    const set = completeChoiceSet(choice('dah'), [uniview, dahua], chosen([]))
    expect(set).toEqual([{ roleKey: 'replay_camera', itemId: 'dah' }])
  })

  // Nothing to write, and an entry with no item id would be a row the RPC
  // cannot insert.
  it('omits a contested role that resolved to nothing and was never pinned', () => {
    const set = completeChoiceSet([], [uniview, dahua], chosen([]))
    expect(set).toEqual([])
  })

  // A role with one active item has nothing to choose between, so a venue that
  // never pinned it must not acquire a row that would later have to be kept in
  // step with the catalog.
  it('ignores a role that has only one active item', () => {
    expect(completeChoiceSet([], [uniview], chosen([['replay_camera', 'uni']])))
      .toEqual([])
  })
})
