import { describe, it, expect } from 'vitest'
import { tierLabel } from './tierLabel'
import type { Tier } from '@/calculator/types'

const ALL: Tier[] = ['basic', 'basic_plus', 'pro', 'autonomous', 'autonomous_plus']

describe('tierLabel', () => {
  // These strings reach a document that is handed to a client, so the raw
  // stored keys must never be what gets printed.
  it('gives every tier a display name, never a stored key', () => {
    expect(ALL.map(tierLabel)).toEqual([
      'Basic', 'Basic+', 'Pro', 'Autonomous', 'Autonomous+',
    ])
    expect(ALL.map(tierLabel).some(n => n.includes('_'))).toBe(false)
  })

  // Basic and Basic+ differ only in software — Basic is the booking website,
  // Basic+ adds the owner app — so neither the calculator nor the printed sheet
  // can tell them apart from hardware. The label is the only thing carrying the
  // distinction, which is why collapsing the two would lose real information.
  it('keeps Basic and Basic+ distinct, since nothing else in the app separates them', () => {
    expect(tierLabel('basic')).toBe('Basic')
    expect(tierLabel('basic_plus')).toBe('Basic+')
  })
})
