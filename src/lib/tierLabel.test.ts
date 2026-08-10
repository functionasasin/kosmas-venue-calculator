import { describe, it, expect } from 'vitest'
import { tierLabel } from './tierLabel'
import type { Tier } from '@/calculator/types'

const ALL: Tier[] = ['basic_plus', 'pro', 'pro_plus', 'autonomous', 'autonomous_plus']

describe('tierLabel', () => {
  // These strings reach a document that is handed to a client, so the raw
  // stored keys must never be what gets printed.
  it('gives every tier a display name, never a stored key', () => {
    expect(ALL.map(tierLabel)).toEqual([
      'Basic+', 'Pro', 'Pro+', 'Autonomous', 'Autonomous+',
    ])
    expect(ALL.map(tierLabel).some(n => n.includes('_'))).toBe(false)
  })

  // Pro and Pro+ are separate tiers with different permissions — Pro forbids
  // door access and cameras, Pro+ allows both — so the label is whatever was
  // chosen. An earlier version inferred the "+" from the door and camera
  // counts, which cannot work: on Pro those are always zero by definition,
  // so the inference had no signal and only ever mislabelled Pro+ deals.
  it('keeps Pro and Pro+ distinct rather than inferring one from the other', () => {
    expect(tierLabel('pro')).toBe('Pro')
    expect(tierLabel('pro_plus')).toBe('Pro+')
    expect(tierLabel('pro')).not.toBe(tierLabel('pro_plus'))
  })
})
