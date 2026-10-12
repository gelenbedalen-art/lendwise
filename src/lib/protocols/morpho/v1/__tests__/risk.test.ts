import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { calculateHealthFactor } from '@/lib/risk/health-factor'
import { priceKeyId } from '@/lib/risk/types'

import { type MorphoBorrowItem, morphoRiskAccount } from '../risk'
import { collateralPriceInLoanAsset } from '../utils'

type SnapshotItem = MorphoBorrowItem & {
  healthFactor: number
  market: MorphoBorrowItem['market'] & { state: { price: string } }
}

const snapshot = JSON.parse(
  readFileSync(
    new URL('./fixtures/morpho-snapshot.json', import.meta.url),
    'utf8'
  )
) as { items: SnapshotItem[] }

const item: MorphoBorrowItem = {
  user: { address: '0xAbC0000000000000000000000000000000000001' },
  market: {
    marketId: '0xmarket',
    lltv: '860000000000000000',
    collateralAsset: { symbol: 'wstETH', decimals: 18 },
    loanAsset: { symbol: 'WETH', decimals: 18 },
    morphoBlue: { chain: { id: 1 } },
  },
  state: {
    collateral: '2000000000000000000',
    borrowAssets: '1500000000000000000',
  },
}

describe('morphoRiskAccount', () => {
  it('maps one isolated market: collateral at lltv, debt at weight 1', () => {
    const account = morphoRiskAccount(item)
    expect(account).toMatchObject({
      id: 'morpho_v1:1:0xmarket:0xabc0000000000000000000000000000000000001',
      chainFamily: 'evm',
      reserves: [
        {
          symbol: 'wstETH',
          collateral: 2,
          liability: 0,
          collateralWeight: 0.86,
          priceKey: { leg: 'collateral' },
        },
        {
          symbol: 'WETH',
          collateral: 0,
          liability: 1.5,
          liabilityWeight: 1,
          priceKey: { leg: 'asset' },
        },
      ],
    })
    expect(account?.reserves[0].priceKey.productId).toBe(
      'morpho:v1:ethereum:market:0xmarket:borrow'
    )
  })

  it('has no account without a collateral asset or a state', () => {
    expect(
      morphoRiskAccount({
        ...item,
        market: { ...item.market, collateralAsset: null },
      })
    ).toBeNull()
    expect(morphoRiskAccount({ ...item, state: null })).toBeNull()
  })

  it.each(snapshot.items.map((i) => [i.market.marketId, i] as const))(
    'matches the health factor Morpho reports for %s within 0.5 %',
    (_, snap) => {
      const account = morphoRiskAccount(snap)
      if (!account) throw new Error('no account')
      const ratio = collateralPriceInLoanAsset(
        snap.market.state.price,
        snap.market.loanAsset.decimals,
        snap.market.collateralAsset?.decimals
      )
      // The loan asset price cancels out: price it 1, collateral = ratio.
      const prices = new Map([
        [priceKeyId(account.reserves[0].priceKey), ratio as number],
        [priceKeyId(account.reserves[1].priceKey), 1],
      ])
      const result = calculateHealthFactor(account.reserves, prices)
      if (result.status !== 'ok') throw new Error(JSON.stringify(result))
      expect(
        Math.abs(result.healthFactor - snap.healthFactor) / snap.healthFactor
      ).toBeLessThan(0.005)
    }
  )
})
