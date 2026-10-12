import { describe, expect, it } from 'vitest'

import { toBaseUnits } from './units'

describe('toBaseUnits', () => {
  it('scales whole tokens to base units', () => {
    expect(toBaseUnits(10000, 7)).toBe('100000000000')
    expect(toBaseUnits(1050, 7)).toBe('10500000000')
    expect(toBaseUnits(1.004479, 7)).toBe('10044790')
  })

  it('rounds away float noise', () => {
    expect(toBaseUnits(0.1 + 0.2, 7)).toBe('3000000')
  })

  it('never renders exponential notation', () => {
    const out = toBaseUnits(1e15, 18)
    expect(out).toMatch(/^\d+$/)
    expect(out.length).toBeGreaterThanOrEqual(33)
  })

  it('returns 0 for non-finite or negative input', () => {
    expect(toBaseUnits(NaN, 7)).toBe('0')
    expect(toBaseUnits(Infinity, 7)).toBe('0')
    expect(toBaseUnits(-5, 7)).toBe('0')
  })
})
