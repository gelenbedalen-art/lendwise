import { describe, expect, it, vi } from 'vitest'

import { priceKeyId } from '@/lib/risk/types'

import {
  type BlendPoolReading,
  blendPriceKey,
  borrowPositionsFromReading,
  normalizePoolIds,
  positionsAdapter,
  readingFromSdk,
  riskAccountFromReading,
  supplyPositionsFromReading,
} from '../positions'

const api = vi.hoisted(() => ({
  getPool: vi.fn(),
  getPoolUser: vi.fn(),
  getTokenMetadata: vi.fn(),
  primeTokenMetadata: vi.fn(),
}))
vi.mock('../../common/api', () => api)
vi.mock('@/lib/db/repositories/products', () => ({
  distinctProtocolAddresses: vi.fn(async () => [
    'cbakazuejbafa2dcgbrs2wkjt3fnimjbhtfl76ay7xmaveinqnniqwao',
  ]),
}))
vi.mock('@/lib/risk/prices', () => ({
  resolveRiskPrices: vi.fn(async () => new Map()),
}))

const POOL = 'CBAKAZUEJBAFA2DCGBRS2WKJT3FNIMJBHTFL76AY7XMAVEINQNNIQWAO'
const XLM = 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA'
const USDC = 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75'
const G = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'

const reading: BlendPoolReading = {
  poolId: POOL,
  poolName: 'Fixed v2.1',
  user: G,
  reserves: [
    {
      assetId: XLM,
      symbol: 'XLM',
      name: 'Stellar Lumens',
      decimals: 7,
      supplied: 50,
      collateral: 1_000,
      liability: 0,
      collateralFactor: 0.75,
      liabilityFactor: 0.95,
      supplyApy: 0.02,
      borrowApy: 0.04,
    },
    {
      assetId: USDC,
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 7,
      supplied: 0,
      collateral: 0,
      liability: 100,
      collateralFactor: 0.95,
      liabilityFactor: 0.95,
      supplyApy: 0.05,
      borrowApy: 0.08,
    },
  ],
}
const prices = new Map([
  [priceKeyId(blendPriceKey(POOL, XLM)), 0.3],
  [priceKeyId(blendPriceKey(POOL, USDC)), 1],
])

describe('Blend v2.1 positions', () => {
  it('keys prices on the v2.1 supply product of the reserve', () => {
    expect(blendPriceKey(POOL, XLM)).toEqual({
      productId: `blend:v2.1:stellar:pool:${POOL.toLowerCase()}:${XLM.toLowerCase()}:supply`,
      leg: 'asset',
    })
  })

  it('uppercases and dedupes catalogue pool ids', () => {
    expect(normalizePoolIds([POOL.toLowerCase(), POOL])).toEqual([POOL])
  })

  it('stores the on-chain l_factor, not the SDK inverse', () => {
    const reserve = {
      assetId: XLM,
      config: { decimals: 7 },
      getCollateralFactor: () => 0.75,
      getLiabilityFactor: () => 1 / 0.95,
      estSupplyApy: 0.02,
      estBorrowApy: 0.04,
    }
    const user = {
      getSupplyFloat: () => 1,
      getCollateralFloat: () => 2,
      getLiabilitiesFloat: () => 3,
    }
    const r = readingFromSdk(reserve as never, user as never, {
      address: XLM,
      symbol: 'XLM',
      name: 'Stellar Lumens',
      decimals: 7,
    })
    expect(r.liabilityFactor).toBeCloseTo(0.95, 12)
    expect(r).toMatchObject({
      supplied: 1,
      collateral: 2,
      liability: 3,
      collateralFactor: 0.75,
    })
  })

  it('builds one risk account per pool with every exposed reserve', () => {
    expect(riskAccountFromReading(reading)).toEqual({
      id: `blend_v2.1:-1:${POOL}:${G}`,
      protocol: 'blend_v2.1',
      chainFamily: 'stellar',
      chainId: -1,
      poolId: POOL,
      user: G,
      reserves: [
        {
          priceKey: blendPriceKey(POOL, XLM),
          symbol: 'XLM',
          collateral: 1_000,
          liability: 0,
          collateralWeight: 0.75,
          liabilityWeight: 0.95,
        },
        {
          priceKey: blendPriceKey(POOL, USDC),
          symbol: 'USDC',
          collateral: 0,
          liability: 100,
          collateralWeight: 0.95,
          liabilityWeight: 0.95,
        },
      ],
    })
  })

  it('has no risk account for supply only', () => {
    expect(
      riskAccountFromReading({
        ...reading,
        reserves: [{ ...reading.reserves[0], collateral: 0 }],
      })
    ).toBeNull()
  })

  it('maps supply rows: supplied + collateral, USD from the price map, APY in percent', () => {
    const [row] = supplyPositionsFromReading(reading, prices)
    expect(row).toMatchObject({
      protocol: 'blend_v2.1',
      poolChainId: -1,
      assetSymbol: 'XLM',
      assetAmount: '10500000000',
      assetAmountUsd: 1050 * 0.3,
      apy: 2,
    })
  })

  it('maps borrow rows with the pool collaterals and the account id', () => {
    const [row] = borrowPositionsFromReading(reading, prices)
    expect(row).toMatchObject({
      loanAssetSymbol: 'USDC',
      loanAssetAmount: 100,
      loanAssetAmountUsd: 100,
      apy: 8,
      riskAccountId: `blend_v2.1:-1:${POOL}:${G}`,
    })
    expect(row.collaterals).toEqual([
      expect.objectContaining({
        symbol: 'XLM',
        amount: 1_000,
        amountUsd: 300,
        lltv: 0.75,
      }),
    ])
  })

  it('rejects when the RPC fails, instead of returning nothing', async () => {
    api.getPool.mockRejectedValue(new Error('429 Too Many Requests'))
    await expect(
      positionsAdapter.getUserBorrowPositions({ addresses: [G] })
    ).rejects.toThrow('429')
  })
})
