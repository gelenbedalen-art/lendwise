import { describe, expect, it, vi } from 'vitest'

import { computeRiskAccounts } from './compute'
import { type RiskAccount, priceKeyId } from './types'

vi.mock('./prices', () => ({ resolveRiskPrices: vi.fn() }))

const account = (id: string, symbol: string): RiskAccount => ({
  id,
  protocol: 'blend_v2.1',
  chainFamily: 'stellar',
  chainId: -1,
  poolId: 'POOL',
  user: 'G',
  reserves: [
    {
      priceKey: { productId: symbol, leg: 'asset' },
      symbol,
      collateral: 100,
      liability: 0,
      collateralWeight: 0.5,
      liabilityWeight: null,
    },
    {
      priceKey: { productId: 'USDC', leg: 'asset' },
      symbol: 'USDC',
      collateral: 0,
      liability: 10,
      collateralWeight: null,
      liabilityWeight: 1,
    },
  ],
})

describe('computeRiskAccounts', () => {
  it('resolves every key once and computes each account', async () => {
    const resolve = vi.fn(
      async () =>
        new Map([
          [priceKeyId({ productId: 'XLM', leg: 'asset' }), 0.4],
          [priceKeyId({ productId: 'USDC', leg: 'asset' }), 1],
        ])
    )
    const results = await computeRiskAccounts(
      [account('a', 'XLM'), account('b', 'EURC')],
      resolve
    )
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(results[0]).toMatchObject({
      id: 'a',
      result: { status: 'ok', healthFactor: 2 },
    })
    expect(results[1]).toMatchObject({
      id: 'b',
      result: { status: 'unknown', reason: 'missing-price', symbols: ['EURC'] },
    })
  })

  it('turns a price lookup failure into unknown accounts', async () => {
    const results = await computeRiskAccounts(
      [account('a', 'XLM')],
      async () => {
        throw new Error('db down')
      }
    )
    expect(results[0].result).toMatchObject({
      status: 'unknown',
      reason: 'missing-price',
    })
  })

  it('skips the lookup with no account', async () => {
    const resolve = vi.fn()
    expect(await computeRiskAccounts([], resolve)).toEqual([])
    expect(resolve).not.toHaveBeenCalled()
  })
})
