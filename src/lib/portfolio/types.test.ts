import { describe, expect, it } from 'vitest'

import type { SupplyPosition } from '@/types'

import { emptyUserPositions, mergeUserPositions } from './types'

const row = (id: string) => ({ id }) as SupplyPosition

describe('mergeUserPositions', () => {
  it('concatenates rows per protocol and never mutates its inputs', () => {
    const a = { supply: { aave_v3: [row('1')] }, borrow: {} }
    const b = {
      supply: { aave_v3: [row('2')], 'blend_v2.1': [row('3')] },
      borrow: {},
    }
    const merged = mergeUserPositions(a, b)
    expect(merged.supply.aave_v3.map((r) => r.id)).toEqual(['1', '2'])
    expect(merged.supply['blend_v2.1']).toHaveLength(1)
    expect(a.supply.aave_v3).toHaveLength(1)
  })

  it('returns a fresh empty value each call', () => {
    expect(emptyUserPositions()).not.toBe(emptyUserPositions())
  })
})
