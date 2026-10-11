import { describe, expect, it } from 'vitest'

import { calculateHealthFactor } from './health-factor'
import { type PriceKey, type RiskReserve, priceKeyId } from './types'

const key = (symbol: string): PriceKey => ({ productId: symbol, leg: 'asset' })

const reserve = (
  r: Partial<RiskReserve> & { symbol: string }
): RiskReserve => ({
  priceKey: key(r.symbol),
  collateral: 0,
  liability: 0,
  collateralWeight: null,
  liabilityWeight: null,
  ...r,
})

const prices = (entries: Record<string, number>) =>
  new Map(
    Object.entries(entries).map(
      ([symbol, p]) => [priceKeyId(key(symbol)), p] as const
    )
  )

describe('calculateHealthFactor', () => {
  it('computes Σ(c·p·cw) / Σ(l·p÷lw) for one collateral and one debt', () => {
    const result = calculateHealthFactor(
      [
        reserve({ symbol: 'XLM', collateral: 10_000, collateralWeight: 0.75 }),
        reserve({ symbol: 'USDC', liability: 1_000, liabilityWeight: 0.95 }),
      ],
      prices({ XLM: 0.3, USDC: 1 })
    )
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.weightedCollateralUsd).toBeCloseTo(2_250, 9)
    expect(result.weightedLiabilityUsd).toBeCloseTo(1_000 / 0.95, 9)
    expect(result.healthFactor).toBeCloseTo(2.1375, 9)
  })

  it('sums several collateral and debt reserves', () => {
    const result = calculateHealthFactor(
      [
        reserve({ symbol: 'ETH', collateral: 2, collateralWeight: 0.83 }),
        reserve({ symbol: 'WBTC', collateral: 0.1, collateralWeight: 0.78 }),
        reserve({ symbol: 'USDC', liability: 4_000, liabilityWeight: 1 }),
        reserve({ symbol: 'DAI', liability: 1_000, liabilityWeight: 1 }),
      ],
      prices({ ETH: 3_000, WBTC: 60_000, USDC: 1, DAI: 1 })
    )
    // (2·3000·0.83 + 0.1·60000·0.78) / (4000 + 1000) = 9660 / 5000
    expect(result).toMatchObject({ status: 'ok' })
    if (result.status === 'ok')
      expect(result.healthFactor).toBeCloseTo(1.932, 9)
  })

  it('handles collateral and debt on the same reserve', () => {
    const result = calculateHealthFactor(
      [
        reserve({
          symbol: 'XLM',
          collateral: 1_000,
          liability: 100,
          collateralWeight: 0.75,
          liabilityWeight: 0.9,
        }),
      ],
      prices({ XLM: 0.3 })
    )
    // (1000·0.3·0.75) / (100·0.3 / 0.9) = 225 / 33.333…
    if (result.status !== 'ok') throw new Error(result.status)
    expect(result.healthFactor).toBeCloseTo(6.75, 9)
  })

  it('fails closed on an unpriced exposed reserve and names it', () => {
    const result = calculateHealthFactor(
      [
        reserve({ symbol: 'ETH', collateral: 2, collateralWeight: 0.83 }),
        reserve({ symbol: 'USDC', liability: 1_000, liabilityWeight: 1 }),
      ],
      prices({ USDC: 1 })
    )
    expect(result).toEqual({
      status: 'unknown',
      reason: 'missing-price',
      symbols: ['ETH'],
    })
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'treats a price of %s as missing',
    (price) => {
      const result = calculateHealthFactor(
        [
          reserve({ symbol: 'ETH', collateral: 2, collateralWeight: 0.83 }),
          reserve({ symbol: 'USDC', liability: 1_000, liabilityWeight: 1 }),
        ],
        prices({ ETH: price, USDC: 1 })
      )
      expect(result).toMatchObject({
        status: 'unknown',
        reason: 'missing-price',
      })
    }
  )

  it('ignores an unpriced reserve with no exposure', () => {
    const result = calculateHealthFactor(
      [
        reserve({ symbol: 'ETH', collateral: 2, collateralWeight: 0.8 }),
        reserve({ symbol: 'USDC', liability: 1_000, liabilityWeight: 1 }),
        reserve({ symbol: 'DUST' }),
      ],
      prices({ ETH: 1_000, USDC: 1 })
    )
    expect(result).toMatchObject({ status: 'ok', healthFactor: 1.6 })
  })

  it('returns no-liability without debt, even with a missing price', () => {
    const result = calculateHealthFactor(
      [reserve({ symbol: 'ETH', collateral: 2, collateralWeight: 0.8 })],
      prices({})
    )
    expect(result).toEqual({ status: 'no-liability' })
  })

  it('returns 0 for debt with no collateral', () => {
    const result = calculateHealthFactor(
      [reserve({ symbol: 'USDC', liability: 10, liabilityWeight: 1 })],
      prices({ USDC: 1 })
    )
    expect(result).toMatchObject({ status: 'ok', healthFactor: 0 })
  })

  it.each([
    { collateralWeight: 1.2, liabilityWeight: 1 },
    { collateralWeight: null, liabilityWeight: 1 },
    { collateralWeight: 0.8, liabilityWeight: 0 },
    { collateralWeight: 0.8, liabilityWeight: 1.5 },
    { collateralWeight: 0.8, liabilityWeight: null },
  ])('rejects weights %o', ({ collateralWeight, liabilityWeight }) => {
    const result = calculateHealthFactor(
      [
        reserve({ symbol: 'ETH', collateral: 1, collateralWeight }),
        reserve({ symbol: 'USDC', liability: 1, liabilityWeight }),
      ],
      prices({ ETH: 1, USDC: 1 })
    )
    expect(result).toMatchObject({
      status: 'unknown',
      reason: 'invalid-weight',
    })
  })

  it('rejects a negative or non-finite amount', () => {
    const result = calculateHealthFactor(
      [reserve({ symbol: 'ETH', collateral: -1, collateralWeight: 0.8 })],
      prices({ ETH: 1 })
    )
    expect(result).toEqual({
      status: 'unknown',
      reason: 'invalid-amount',
      symbols: ['ETH'],
    })
  })
})
