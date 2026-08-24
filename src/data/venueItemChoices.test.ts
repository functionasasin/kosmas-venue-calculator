import { describe, it, expect, vi, beforeEach } from 'vitest'

const eq = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq }) }) },
}))

beforeEach(() => vi.clearAllMocks())

const { listChoices } = await import('./venueItemChoices')

describe('listChoices', () => {
  it('maps rows to the app shape', async () => {
    eq.mockResolvedValueOnce({
      data: [{ venue_id: 'v1', role_key: 'replay_camera', item_id: 'i1' }],
      error: null,
    })
    expect(await listChoices('v1')).toEqual([
      { roleKey: 'replay_camera', itemId: 'i1' },
    ])
  })

  // role_key is plain text with no check constraint, exactly like
  // items.role_key and venue_lines.origin_role_key. A choice naming a role the
  // app has retired is inert — nothing sizes it — but letting it through as a
  // RoleKey would put a phantom entry in the picker map and in the saved
  // choice set, where it would be re-written on every save forever.
  it('drops choices for role keys the app no longer knows', async () => {
    eq.mockResolvedValueOnce({
      data: [{ venue_id: 'v1', role_key: 'ipad_fence_bracket', item_id: 'i9' }],
      error: null,
    })
    expect(await listChoices('v1')).toEqual([])
  })

  it('throws the PostgREST error rather than returning an empty list', async () => {
    eq.mockResolvedValueOnce({ data: null, error: new Error('nope') })
    await expect(listChoices('v1')).rejects.toThrow('nope')
  })
})
