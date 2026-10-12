import { type RiskAccount, riskAccountId } from '@/lib/risk/types'

import { buildProductId } from './utils'

const PROTOCOL = 'morpho_v1'

/** The fields of a Morpho `marketPositions` item the risk account needs. */
export interface MorphoBorrowItem {
  user: { address: string }
  market: {
    marketId: string
    lltv: string | number
    collateralAsset?: { symbol: string; decimals: number } | null
    loanAsset: { symbol: string; decimals: number }
    morphoBlue: { chain: { id: number } }
  }
  state?: {
    collateral: string | number | null
    borrowAssets?: string | number | null
  } | null
}

export function morphoRiskAccountId(item: MorphoBorrowItem): string {
  return riskAccountId({
    protocol: PROTOCOL,
    chainId: item.market.morphoBlue.chain.id,
    poolId: item.market.marketId,
    user: item.user.address.toLowerCase(),
  })
}

/**
 * One isolated Morpho market: the collateral weighted by its LLTV and priced
 * by the market oracle (collateral leg), the debt at weight 1.
 */
export function morphoRiskAccount(item: MorphoBorrowItem): RiskAccount | null {
  const { market, state } = item
  if (!market.collateralAsset || !state) return null
  const chainId = market.morphoBlue.chain.id
  const productId = buildProductId(chainId, market.marketId, 'borrow')
  return {
    id: morphoRiskAccountId(item),
    protocol: PROTOCOL,
    chainFamily: 'evm',
    chainId,
    poolId: market.marketId,
    user: item.user.address.toLowerCase(),
    reserves: [
      {
        priceKey: { productId, leg: 'collateral' },
        symbol: market.collateralAsset.symbol,
        collateral:
          Number(state.collateral ?? 0) / 10 ** market.collateralAsset.decimals,
        liability: 0,
        collateralWeight: Number(market.lltv) / 1e18,
        liabilityWeight: null,
      },
      {
        priceKey: { productId, leg: 'asset' },
        symbol: market.loanAsset.symbol,
        collateral: 0,
        liability:
          Number(state.borrowAssets ?? 0) / 10 ** market.loanAsset.decimals,
        collateralWeight: null,
        liabilityWeight: 1,
      },
    ],
  }
}
