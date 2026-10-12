import { describe, expect, it } from 'vitest'

import { summarizeHealth } from './summary'
import type { HealthFactorResult, RiskAccountResult } from './types'

const r = (id: string, result: HealthFactorResult): RiskAccountResult => ({
  id,
  protocol: 'p',
  poolId: 'pool',
  user: 'u',
  result,
})
const ok = (hf: number): HealthFactorResult => ({
  status: 'ok',
  healthFactor: hf,
  weightedCollateralUsd: hf,
  weightedLiabilityUsd: 1,
})

describe('summarizeHealth', () => {
  it('is none without accounts or reported values', () => {
    expect(summarizeHealth([])).toEqual({ status: 'none' })
  })

  it('keeps the lowest health factor, reported values included', () => {
    expect(
      summarizeHealth([r('a', ok(2.4)), r('b', ok(1.7))], [3, 1.9])
    ).toEqual({
      status: 'ok',
      lowest: 1.7,
    })
    expect(summarizeHealth([], [1.2, 0])).toEqual({ status: 'ok', lowest: 1.2 })
  })

  it('reports unknown with the count when one account is unknown', () => {
    expect(
      summarizeHealth([
        r('a', ok(2.4)),
        r('b', {
          status: 'unknown',
          reason: 'missing-price',
          symbols: ['XLM'],
        }),
      ])
    ).toEqual({ status: 'unknown', unknownCount: 1, lowest: 2.4 })
  })

  it('is no-liability when no account carries debt', () => {
    expect(summarizeHealth([r('a', { status: 'no-liability' })])).toEqual({
      status: 'no-liability',
    })
  })

  it('counts orphan rows as unknown', () => {
    expect(
      summarizeHealth(
        [
          r('a', {
            status: 'ok',
            healthFactor: 2.4,
            weightedCollateralUsd: 1,
            weightedLiabilityUsd: 1,
          }),
        ],
        [],
        2
      )
    ).toEqual({ status: 'unknown', unknownCount: 2, lowest: 2.4 })
  })

  it('is unknown, not none, when orphans are all there is', () => {
    expect(summarizeHealth([], [], 1)).toEqual({
      status: 'unknown',
      unknownCount: 1,
      lowest: null,
    })
  })
})
