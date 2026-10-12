import { describe, expect, it, vi } from 'vitest'

import { calculateHealthFactor } from '@/lib/risk/health-factor'
import { priceKeyId } from '@/lib/risk/types'

import { fixtureAddress } from './config'
import {
  FIXTURE_RESERVES,
  createStellarFixtureAdapter,
  fixturePriceKey,
  fixtureRiskAccount,
} from './index'

vi.mock('@/lib/risk/prices', () => ({ resolveRiskPrices: vi.fn() }))

const G = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'
const OTHER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
const prices = new Map(
  FIXTURE_RESERVES.map(
    (r) =>
      [
        priceKeyId(fixturePriceKey(r.assetId)),
        r.symbol === 'XLM' ? 0.3 : 1,
      ] as const
  )
)

describe('fixtureAddress', () => {
  it('is off without the variable and always off in production', () => {
    expect(fixtureAddress({})).toBeNull()
    expect(
      fixtureAddress({
        STELLAR_RISK_FIXTURE_ADDRESS: G,
        VERCEL_ENV: 'production',
      })
    ).toBeNull()
    expect(
      fixtureAddress({
        STELLAR_RISK_FIXTURE_ADDRESS: ` ${G} `,
        VERCEL_ENV: 'preview',
      })
    ).toBe(G)
  })
})

describe('Stellar fixture adapter', () => {
  it('exposes known reserves and weights whose health factor is computable', () => {
    const account = fixtureRiskAccount(G)
    const result = calculateHealthFactor(account.reserves, prices)
    // (10000·0.3·0.75) / (1000·1 / 0.95)
    expect(result).toMatchObject({ status: 'ok' })
    if (result.status === 'ok')
      expect(result.healthFactor).toBeCloseTo(2.1375, 9)
  })

  it('goes unknown when one reserve price is removed from the map', () => {
    const withoutXlm = new Map(prices)
    withoutXlm.delete(priceKeyId(fixturePriceKey(FIXTURE_RESERVES[0].assetId)))
    expect(
      calculateHealthFactor(fixtureRiskAccount(G).reserves, withoutXlm)
    ).toMatchObject({
      status: 'unknown',
      reason: 'missing-price',
      symbols: ['XLM'],
    })
  })

  it('serves its positions only to the configured address', async () => {
    const adapter = createStellarFixtureAdapter(G, async () => prices)
    expect(await adapter.getRiskAccounts!({ addresses: [OTHER] })).toEqual([])
    const [borrow] = await adapter.getUserBorrowPositions({
      addresses: [G, OTHER],
    })
    expect(borrow).toMatchObject({
      protocol: 'stellar_fixture',
      loanAssetSymbol: 'USDC',
      loanAssetAmountUsd: 1_000,
      riskAccountId: fixtureRiskAccount(G).id,
    })
    const supply = await adapter.getUserSupplyPositions({ addresses: [G] })
    expect(supply).toEqual([
      expect.objectContaining({ assetSymbol: 'XLM', assetAmountUsd: 3_000 }),
    ])
  })
})
