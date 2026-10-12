import { describe, expect, it } from 'vitest'

import type { RiskAccountResult } from '@/lib/risk/types'
import type { BorrowPosition } from '@/types'

import {
  attachRisk,
  failureLabel,
  reportedHealthFactors,
  sortableHealth,
} from './view'

const row = (p: Partial<BorrowPosition>) =>
  ({ healthFactor: 0, ...p }) as BorrowPosition
const ok = (id: string, hf: number): RiskAccountResult => ({
  id,
  protocol: 'p',
  poolId: 'x',
  user: 'u',
  result: {
    status: 'ok',
    healthFactor: hf,
    weightedCollateralUsd: hf,
    weightedLiabilityUsd: 1,
  },
})

describe('portfolio view helpers', () => {
  it('attaches the module result by risk account id', () => {
    const rows = attachRisk(
      [row({ riskAccountId: 'a' }), row({ healthFactor: 1.4 })],
      [ok('a', 2)]
    )
    expect(rows[0].risk).toMatchObject({ status: 'ok', healthFactor: 2 })
    expect(rows[1].risk).toBeUndefined()
  })

  it('marks a row with a risk account id but no result as unknown, never the placeholder', () => {
    const rows = attachRisk([row({ riskAccountId: 'b' })], [ok('a', 2)])
    expect(rows[0].risk).toEqual({
      status: 'unknown',
      reason: 'missing-price',
      symbols: [],
    })
    expect(attachRisk([row({ riskAccountId: 'b' })], [])[0].risk?.status).toBe(
      'unknown'
    )
  })

  it('collects protocol-reported values only for rows without a risk account id', () => {
    const rows = attachRisk(
      [
        row({ riskAccountId: 'a', healthFactor: 9 }),
        row({ riskAccountId: 'missing', healthFactor: 0 }),
        row({ healthFactor: 1.4 }),
      ],
      [ok('a', 2)]
    )
    expect(reportedHealthFactors(rows)).toEqual([1.4])
  })

  it('sorts unknown first and no-liability last', () => {
    expect(
      sortableHealth({
        ...row({}),
        risk: { status: 'unknown', reason: 'missing-price', symbols: [] },
      })
    ).toBe(-1)
    expect(
      sortableHealth({ ...row({}), risk: { status: 'no-liability' } })
    ).toBe(Number.POSITIVE_INFINITY)
    expect(sortableHealth(row({ healthFactor: 1.2 }))).toBe(1.2)
  })

  it('labels failures for the banner', () => {
    expect(
      failureLabel({
        chainFamily: 'stellar',
        source: 'stellar_wallet',
        message: '',
      })
    ).toBe('Stellar wallet')
    expect(
      failureLabel({
        chainFamily: 'stellar',
        source: 'blend_v2.1',
        message: '',
      })
    ).toBe('Stellar · Blend v2.1')
    expect(
      failureLabel({ chainFamily: 'evm', source: 'evm', message: '' })
    ).toBe('EVM')
  })
})
