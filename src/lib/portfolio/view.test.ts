import { describe, expect, it } from 'vitest'

import type { StellarHolding } from '@/lib/portfolio/types'
import type { RiskAccountResult } from '@/lib/risk/types'
import type { BorrowPosition } from '@/types'

import {
  attachRisk,
  failureLabel,
  orphanRiskRows,
  reportedHealthFactors,
  sortableHealth,
  walletBalanceRows,
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

  it('counts distinct risk accounts that have no result', () => {
    const rows = [
      row({ riskAccountId: 'a' }),
      row({ riskAccountId: 'a' }),
      row({ riskAccountId: 'b' }),
      row({ riskAccountId: 'c' }),
      row({}),
    ]
    expect(orphanRiskRows(rows, [ok('c', 2)])).toBe(2)
    expect(orphanRiskRows(rows, [ok('a', 2), ok('b', 2), ok('c', 2)])).toBe(0)
  })
})

describe('walletBalanceRows', () => {
  const holding = (h: Partial<StellarHolding>): StellarHolding => ({
    owner: 'GOWNER',
    assetType: 'credit',
    code: 'USDC',
    issuer: 'GISSUER',
    balance: 1,
    priceUsd: 1,
    valueUsd: 1,
    ...h,
  })

  it('maps holdings to stellar rows', () => {
    const rows = walletBalanceRows([
      holding({
        code: 'USDC',
        issuer: 'GISSUER',
        balance: 12.5,
        valueUsd: 12.5,
      }),
    ])
    expect(rows).toEqual([
      {
        id: 'GOWNER:USDC:GISSUER',
        network: 'stellar',
        userAddress: 'GOWNER',
        assetCode: 'USDC',
        issuer: 'GISSUER',
        balance: 12.5,
        valueUsd: 12.5,
      },
    ])
  })

  it('uses a native id and null issuer for XLM', () => {
    const [r] = walletBalanceRows([
      holding({ assetType: 'native', code: 'XLM', issuer: null }),
    ])
    expect(r.id).toBe('GOWNER:XLM:native')
    expect(r.issuer).toBeNull()
  })

  it('sorts by value desc, unpriced last, then by code', () => {
    const rows = walletBalanceRows([
      holding({ code: 'ZZZ', issuer: 'A', valueUsd: null, priceUsd: null }),
      holding({ code: 'AAA', issuer: 'B', valueUsd: null, priceUsd: null }),
      holding({ code: 'LOW', issuer: 'C', valueUsd: 1 }),
      holding({ code: 'HIGH', issuer: 'D', valueUsd: 50 }),
    ])
    expect(rows.map((r) => r.assetCode)).toEqual(['HIGH', 'LOW', 'AAA', 'ZZZ'])
  })

  it('keeps ids unique for the same code with different issuers', () => {
    const rows = walletBalanceRows([
      holding({ issuer: 'G1' }),
      holding({ issuer: 'G2' }),
    ])
    expect(new Set(rows.map((r) => r.id)).size).toBe(2)
  })
})
