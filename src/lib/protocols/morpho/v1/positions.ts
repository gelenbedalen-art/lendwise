import type { Address } from 'viem'

import { activeProductIds } from '@/lib/db/repositories/products'
import {
  CHAIN_SLUG_MAP,
  type RegisteredChainId,
  createGraphQLClient,
} from '@/lib/protocols/core/toolkit'
import { dedupeInFlight } from '@/lib/protocols/core/toolkit/inflight'
import type { RiskAccount } from '@/lib/risk/types'
import { generateSlug } from '@/lib/utils'
import {
  BorrowPosition,
  MarketRate,
  SupplyPosition,
  TimeframeLabel,
} from '@/types'

import { MORPHO_V1_API_URL, MORPHO_V1_CHAINS } from './config'
import {
  MarketBorrowHistoryRatesQuery,
  TimeseriesInterval,
  UserBorrowPositionsQuery,
  UserSupplyPositionsQuery,
  VaultHistoryQuery,
} from './generated/graphql'
import {
  MARKET_BORROW_HISTORY,
  USER_BORROW_POSITIONS,
  USER_SUPPLY_POSITIONS,
  VAULT_SUPPLY_HISTORY,
} from './queries'
import {
  isPricedMorphoItem,
  morphoRiskAccount,
  morphoRiskAccountId,
  morphoRiskProductId,
} from './risk'

export const client = createGraphQLClient(MORPHO_V1_API_URL)

export async function getUserSupplyPositions({
  addresses,
}: {
  addresses: Address[]
}): Promise<SupplyPosition[]> {
  if (!addresses || addresses.length === 0) {
    return []
  }

  try {
    // Get all chain IDs from MORPHO_V1_CHAINS
    const chainIds = Object.keys(MORPHO_V1_CHAINS).map(Number)

    const allPositions: SupplyPosition[] = []
    let skip = 0
    let hasMore = true

    // Fetch all pages until we have all positions
    while (hasMore) {
      const { data, error } = await client
        .query<UserSupplyPositionsQuery>(USER_SUPPLY_POSITIONS, {
          where: {
            chainId_in: chainIds,
            userAddress_in: addresses,
          },
          first: 100,
          skip,
        })
        .toPromise()

      if (error) {
        console.error('Failed to fetch Morpho V1 positions:', error)
        // Check if it's a timeout error
        if (error.message?.includes('Time-out') || error.networkError) {
          console.warn('Morpho V1 API timeout - returning empty positions')
        }
        return allPositions // Return what we have so far
      }

      if (!data || !data.vaultPositions || !data.vaultPositions.items) {
        break
      }

      const positions = data.vaultPositions.items
        .filter((position) => {
          // Only include supply positions (positive balance)
          const balance = BigInt(position.state?.assets ?? 0)
          return balance > 0n
        })
        .map((position): SupplyPosition => {
          const network =
            CHAIN_SLUG_MAP[position.vault.chain.id as RegisteredChainId]
          if (!network)
            throw new Error(
              `No slug registered for chainId ${position.vault.chain.id} — add it to chain-slugs.ts`
            )
          return {
            id: position.id,
            protocol: 'morpho_v1',
            network,
            userAddress: position.user.address.toLowerCase(),
            poolName: position.vault.name,
            poolAddress: position.vault.address,
            poolId: position.vault.address,
            poolChainId: Number(position.vault.chain.id),
            assetAddress: position.vault.asset.address,
            assetName: position.vault.asset.name,
            assetSymbol: position.vault.asset.symbol,
            assetDecimals: position.vault.asset.decimals,
            assetAmount: (position.state?.assets ?? 0).toString(),
            assetAmountUsd: position.state?.assetsUsd ?? 0,
            assetLiveAmountUsd: position.state?.assetsUsd ?? 0,
            apy: position.vault.state?.avgNetApy
              ? position.vault.state.avgNetApy * 100
              : 0,
            link: `https://app.morpho.org/${position.vault.chain.network.toLowerCase()}/vault/${position.vault.address}/${generateSlug(position.vault.name)}?subTab=yourPosition`,
          }
        })

      allPositions.push(...positions)

      // Check if there are more pages to fetch
      const pageInfo = data.vaultPositions.pageInfo
      if (pageInfo && pageInfo.countTotal > skip + pageInfo.count) {
        skip += pageInfo.count
      } else {
        hasMore = false
      }
    }

    return allPositions
  } catch (err) {
    console.error('Unexpected error fetching Morpho V1 positions:', err)
    return []
  }
}

type BorrowItem = NonNullable<
  NonNullable<UserBorrowPositionsQuery['marketPositions']>['items']
>[number]

async function fetchUserBorrowItems(
  addresses: Address[]
): Promise<BorrowItem[]> {
  // Get all chain IDs from MORPHO_V1_CHAINS
  const chainIds = Object.keys(MORPHO_V1_CHAINS).map(Number)

  const allItems: BorrowItem[] = []
  let skip = 0
  let hasMore = true

  // Fetch all pages until we have all positions
  while (hasMore) {
    const { data, error } = await client
      .query<UserBorrowPositionsQuery>(USER_BORROW_POSITIONS, {
        where: {
          chainId_in: chainIds,
          userAddress_in: [...addresses],
        },
        first: 100,
        skip,
      })
      .toPromise()

    if (error) {
      console.error('Failed to fetch Morpho V1 positions:', error)
      // Check if it's a timeout error
      if (error.message?.includes('Time-out') || error.networkError) {
        console.warn('Morpho V1 API timeout - returning empty positions')
      }
      return allItems // Return what we have so far
    }

    if (!data || !data.marketPositions || !data.marketPositions.items) {
      break
    }

    allItems.push(...data.marketPositions.items)

    // Check if there are more pages to fetch
    const pageInfo = data.marketPositions.pageInfo
    if (pageInfo && pageInfo.countTotal > skip + pageInfo.count) {
      skip += pageInfo.count
    } else {
      hasMore = false
    }
  }
  return allItems
}

/** The catalogued borrow productIds among `items`; empty when the lookup fails. */
async function cataloguedBorrowIds(items: BorrowItem[]): Promise<Set<string>> {
  const ids = [...new Set(items.flatMap((i) => morphoRiskProductId(i) ?? []))]
  try {
    return await activeProductIds(ids)
  } catch (err) {
    console.error('[morpho] catalogue lookup failed:', err)
    return new Set()
  }
}

/** Positions, risk accounts and the catalogue check share one read. */
const fetchUserBorrowReadOnce = dedupeInFlight(
  (addresses: Address[]) =>
    addresses
      .map((a) => a.toLowerCase())
      .sort()
      .join(','),
  async (addresses: Address[]) => {
    const items = await fetchUserBorrowItems(addresses)
    return { items, catalogued: await cataloguedBorrowIds(items) }
  }
)

export async function getUserBorrowPositions({
  addresses,
}: {
  addresses: Address[]
}): Promise<BorrowPosition[]> {
  // Return empty array if no addresses provided
  if (!addresses || addresses.length === 0) {
    return []
  }

  try {
    const { items, catalogued } = await fetchUserBorrowReadOnce(addresses)

    return items.map((position): BorrowPosition => {
      const network =
        CHAIN_SLUG_MAP[position.market.morphoBlue.chain.id as RegisteredChainId]
      if (!network)
        throw new Error(
          `No slug registered for chainId ${position.market.morphoBlue.chain.id} — add it to chain-slugs.ts`
        )
      return {
        id: position.id,
        protocol: 'morpho_v1',
        network,
        healthFactor: Number(position.healthFactor),
        userAddress: position.user.address.toLowerCase(),
        poolId: position.market.marketId,
        poolName: `${position.market.collateralAsset?.symbol}/${position.market.loanAsset?.symbol}`,
        poolAddress: position.market.marketId,
        poolChainId: position.market.morphoBlue.chain.id,
        loanAssetAddress: position.market.loanAsset.address,
        loanAssetName: position.market.loanAsset.name,
        loanAssetSymbol: position.market.loanAsset.symbol,
        loanAssetDecimals: position.market.loanAsset.decimals,
        loanAssetAmount: position.state
          ? position.state.borrowAssets /
            Number(`1e${position.market.loanAsset.decimals}`)
          : 0,
        loanAssetAmountUsd: position.state?.borrowAssetsUsd ?? 0,
        loanLiveAssetAmountUsd: position.state?.borrowAssetsUsd ?? 0,
        loanTimestamp: 0,
        collaterals: [
          {
            address: position.market.collateralAsset?.address,
            name: position.market.collateralAsset?.name ?? '',
            symbol: position.market.collateralAsset?.symbol ?? '',
            decimals: position.market.collateralAsset?.decimals ?? 0,
            amount: position.state?.collateral,
            amountUsd: position.state?.collateralUsd ?? 0,
          },
        ],
        apy: position.market.state?.avgBorrowApy
          ? Number((position.market.state.avgBorrowApy * 100).toFixed(2))
          : 0,
        riskAccountId: isPricedMorphoItem(position, catalogued)
          ? morphoRiskAccountId(position)
          : undefined,
        link: `https://app.morpho.org/${position.market.morphoBlue.chain.network.toLowerCase()}/market/${position.market.marketId}/${generateSlug(position.market.collateralAsset?.symbol + '-' + position.market.loanAsset?.symbol)}?subTab=yourPosition`,
      }
    })
  } catch (err) {
    console.error('Unexpected error fetching Morpho V1 positions:', err)
    return []
  }
}

export async function getRiskAccounts({
  addresses,
}: {
  addresses: Address[]
}): Promise<RiskAccount[]> {
  if (addresses.length === 0) return []
  const { items, catalogued } = await fetchUserBorrowReadOnce(addresses)
  return items.flatMap((item) =>
    isPricedMorphoItem(item, catalogued) ? (morphoRiskAccount(item) ?? []) : []
  )
}

const TIMEFRAME_MAP: Record<TimeframeLabel, TimeseriesInterval> = {
  '24h': TimeseriesInterval.HOUR,
  '7d': TimeseriesInterval.DAY,
  '1M': TimeseriesInterval.DAY,
  '3M': TimeseriesInterval.WEEK,
  '1Y': TimeseriesInterval.WEEK,
  Max: TimeseriesInterval.QUARTER,
}

export async function getMarketBorrowHistoryRates({
  poolId,
  interval,
  fromTimestamp,
}: {
  poolId: string
  interval: TimeframeLabel
  fromTimestamp: number
}): Promise<MarketRate[]> {
  console.log('borrow', poolId)
  const { data, error } = await client
    .query<MarketBorrowHistoryRatesQuery>(MARKET_BORROW_HISTORY, {
      marketId: poolId,
      options: {
        startTimestamp: fromTimestamp,
        endTimestamp: null,
        interval: TIMEFRAME_MAP[interval],
      },
    })
    .toPromise()

  if (error) {
    console.error(`Failed to fetch Morpho V1 borrow rates:`, error)
    if (error.message?.includes('Time-out') || error.networkError) {
      console.warn(`Morpho V1 API timeout - returning empty rates`)
    }
    return []
  }

  return (
    data?.marketById?.historicalState?.netBorrowApy.reverse().map((item) => ({
      timestamp: item.x,
      rate: item.y ?? 0,
    })) ?? []
  )
}

export async function getMarketSupplyHistoryRates({
  poolId,
  interval,
  fromTimestamp,
}: {
  poolId: string
  interval: TimeframeLabel
  fromTimestamp: number
}): Promise<MarketRate[]> {
  const { data, error } = await client
    .query<VaultHistoryQuery>(VAULT_SUPPLY_HISTORY, {
      address: poolId,
      options: {
        startTimestamp: fromTimestamp,
        endTimestamp: null,
        interval: TIMEFRAME_MAP[interval],
      },
    })
    .toPromise()

  if (error) {
    console.error(`Failed to fetch Morpho V1 vault supply rates:`, error)
    if (error.message?.includes('Time-out') || error.networkError) {
      console.warn(`Morpho V1 API timeout - returning empty rates`)
    }
    return []
  }

  return (
    data?.vaultByAddress.historicalState?.netApy.reverse().map((item) => ({
      timestamp: item.x,
      rate: item.y ?? 0,
    })) ?? []
  )
}
