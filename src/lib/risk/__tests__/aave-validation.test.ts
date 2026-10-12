import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { calculateHealthFactor } from '../health-factor'
import { type PriceKey, type RiskReserve, priceKeyId } from '../types'

interface AaveSnapshot {
  capturedAt: string
  chainId: number
  market: string
  user: string
  reportedHealthFactor: number
  collaterals: {
    symbol: string
    address: string
    amount: number
    usdPerToken: number
    liquidationThreshold: number
  }[]
  debts: {
    symbol: string
    address: string
    amount: number
    usdPerToken: number
  }[]
}

const snapshot = JSON.parse(
  readFileSync(
    new URL('./fixtures/aave-snapshot.json', import.meta.url),
    'utf8'
  )
) as AaveSnapshot

const key = (address: string): PriceKey => ({
  productId: `aave:${address.toLowerCase()}`,
  leg: 'asset',
})

describe('Aave validation', () => {
  it('reproduces the health factor Aave reports, within 0.5 %', () => {
    const reserves: RiskReserve[] = [
      ...snapshot.collaterals.map((c) => ({
        priceKey: key(c.address),
        symbol: c.symbol,
        collateral: c.amount,
        liability: 0,
        collateralWeight: c.liquidationThreshold,
        liabilityWeight: null,
      })),
      ...snapshot.debts.map((d) => ({
        priceKey: key(d.address),
        symbol: d.symbol,
        collateral: 0,
        liability: d.amount,
        collateralWeight: null,
        liabilityWeight: 1,
      })),
    ]
    const prices = new Map(
      [...snapshot.collaterals, ...snapshot.debts].map(
        (x) => [priceKeyId(key(x.address)), x.usdPerToken] as const
      )
    )

    const result = calculateHealthFactor(reserves, prices)

    if (result.status !== 'ok') throw new Error(JSON.stringify(result))
    const drift =
      Math.abs(result.healthFactor - snapshot.reportedHealthFactor) /
      snapshot.reportedHealthFactor
    expect(drift).toBeLessThan(0.005)
  })
})
