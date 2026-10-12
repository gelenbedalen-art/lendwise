import type { PoolUser, PoolV2, Reserve } from '@blend-capital/blend-sdk'

import { distinctProtocolAddresses } from '@/lib/db/repositories/products'
import { CHAIN_SLUG_MAP } from '@/lib/protocols/core/toolkit/chain-slugs'
import { dedupeInFlight } from '@/lib/protocols/core/toolkit/inflight'
import type { StellarPositionsAdapter } from '@/lib/protocols/core/types'
import { resolveRiskPrices } from '@/lib/risk/prices'
import {
  type PriceKey,
  type PriceMap,
  type RiskAccount,
  priceKeyId,
  riskAccountId,
} from '@/lib/risk/types'
import type { BorrowPosition, SupplyPosition } from '@/types'

import {
  getPool,
  getPoolUser,
  getTokenMetadata,
  primeTokenMetadata,
} from '../common/api'
import { BLEND_PROVIDER } from '../common/config'
import { BLEND_DEPLOYMENTS } from '../common/deployments'
import type { TokenMetadata } from '../common/types'
import { buildProductId } from '../common/utils'

const PROTOCOL = 'blend_v2.1' as const
const CHAIN_ID = -1
const NETWORK = CHAIN_SLUG_MAP['-1']
const deployment = BLEND_DEPLOYMENTS['v2.1']

export interface BlendReserveReading {
  assetId: string
  symbol: string
  name: string
  decimals: number
  /** Non-collateral supply, whole tokens. */
  supplied: number
  collateral: number
  liability: number
  /** c_factor, in [0, 1]. */
  collateralFactor: number
  /** l_factor as stored on chain, in (0, 1] — NOT the SDK's inverse. */
  liabilityFactor: number
  /** Fractions, as the SDK estimates them. */
  supplyApy: number
  borrowApy: number
}

export interface BlendPoolReading {
  poolId: string
  poolName: string
  user: string
  reserves: BlendReserveReading[]
}

/** Product ids store pools lowercased; Soroban needs the `C…` strkey. */
export function normalizePoolIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.toUpperCase()))]
}

/** The spot pipeline's price of a reserve: its v2.1 supply product. */
export function blendPriceKey(poolId: string, assetId: string): PriceKey {
  return {
    productId: buildProductId({
      poolId,
      assetId,
      kind: 'supply',
      version: deployment.label,
    }),
    leg: 'asset',
  }
}

export function readingFromSdk(
  reserve: Reserve,
  user: PoolUser,
  token: TokenMetadata
): BlendReserveReading {
  return {
    assetId: reserve.assetId,
    symbol: token.symbol,
    name: token.name,
    decimals: reserve.config.decimals,
    supplied: user.getSupplyFloat(reserve),
    collateral: user.getCollateralFloat(reserve),
    liability: user.getLiabilitiesFloat(reserve),
    collateralFactor: reserve.getCollateralFactor(),
    // getLiabilityFactor() returns 1 / l_factor so that callers can multiply;
    // the health factor formula divides by l_factor itself.
    liabilityFactor: 1 / reserve.getLiabilityFactor(),
    supplyApy: reserve.estSupplyApy,
    borrowApy: reserve.estBorrowApy,
  }
}

const accountId = (r: BlendPoolReading) =>
  riskAccountId({
    protocol: PROTOCOL,
    chainId: CHAIN_ID,
    poolId: r.poolId,
    user: r.user,
  })

export function riskAccountFromReading(
  r: BlendPoolReading
): RiskAccount | null {
  const reserves = r.reserves
    .filter((x) => x.collateral > 0 || x.liability > 0)
    .map((x) => ({
      priceKey: blendPriceKey(r.poolId, x.assetId),
      symbol: x.symbol,
      collateral: x.collateral,
      liability: x.liability,
      collateralWeight: x.collateralFactor,
      liabilityWeight: x.liabilityFactor,
    }))
  if (!reserves.some((x) => x.liability > 0)) return null
  return {
    id: accountId(r),
    protocol: PROTOCOL,
    chainFamily: 'stellar',
    chainId: CHAIN_ID,
    poolId: r.poolId,
    user: r.user,
    reserves,
  }
}

const usd = (
  r: BlendPoolReading,
  assetId: string,
  amount: number,
  prices: PriceMap
) => amount * (prices.get(priceKeyId(blendPriceKey(r.poolId, assetId))) ?? 0)

const link = (poolId: string) =>
  `https://mainnet.blend.capital/dashboard/?poolId=${poolId}`

export function supplyPositionsFromReading(
  r: BlendPoolReading,
  prices: PriceMap
): SupplyPosition[] {
  return r.reserves.flatMap((x): SupplyPosition[] => {
    const amount = x.supplied + x.collateral
    if (!(amount > 0)) return []
    const amountUsd = usd(r, x.assetId, amount, prices)
    return [
      {
        id: `${PROTOCOL}:${r.poolId}:${r.user}:${x.assetId}:supply`,
        protocol: PROTOCOL,
        network: NETWORK,
        userAddress: r.user,
        poolName: r.poolName,
        poolAddress: r.poolId,
        poolId: r.poolId,
        poolChainId: CHAIN_ID,
        assetAddress: x.assetId,
        assetName: x.name,
        assetSymbol: x.symbol,
        assetDecimals: x.decimals,
        assetAmount: amount.toString(),
        assetAmountUsd: amountUsd,
        assetLiveAmountUsd: amountUsd,
        apy: x.supplyApy * 100,
        link: link(r.poolId),
      },
    ]
  })
}

export function borrowPositionsFromReading(
  r: BlendPoolReading,
  prices: PriceMap
): BorrowPosition[] {
  const collaterals = r.reserves
    .filter((x) => x.collateral > 0)
    .map((x) => ({
      address: x.assetId,
      name: x.name,
      symbol: x.symbol,
      decimals: x.decimals,
      lltv: x.collateralFactor,
      amount: x.collateral,
      amountUsd: usd(r, x.assetId, x.collateral, prices),
    }))
  return r.reserves.flatMap((x): BorrowPosition[] => {
    if (!(x.liability > 0)) return []
    const loanUsd = usd(r, x.assetId, x.liability, prices)
    return [
      {
        id: `${PROTOCOL}:${r.poolId}:${r.user}:${x.assetId}:borrow`,
        protocol: PROTOCOL,
        network: NETWORK,
        // Shown from the risk account (riskAccountId), not from this field.
        healthFactor: 0,
        userAddress: r.user,
        poolId: r.poolId,
        poolName: r.poolName,
        poolAddress: r.poolId,
        poolChainId: CHAIN_ID,
        loanAssetAddress: x.assetId,
        loanAssetName: x.name,
        loanAssetSymbol: x.symbol,
        loanAssetDecimals: x.decimals,
        loanAssetAmount: x.liability,
        loanAssetAmountUsd: loanUsd,
        loanLiveAssetAmountUsd: loanUsd,
        loanTimestamp: 0,
        collaterals,
        apy: x.borrowApy * 100,
        link: link(r.poolId),
        riskAccountId: accountId(r),
      },
    ]
  })
}

async function loadReadings(addresses: string[]): Promise<BlendPoolReading[]> {
  // Every v2.1 pool ever catalogued: a frozen pool still holds positions.
  const poolIds = normalizePoolIds(
    await distinctProtocolAddresses(BLEND_PROVIDER, deployment.label)
  )
  const out: BlendPoolReading[] = []
  for (const poolId of poolIds) {
    const pool = (await getPool({ version: deployment.sdk, poolId })) as PoolV2
    if (pool.metadata.status === 6) continue // setup, never launched
    const reserves = [...pool.reserves.values()]
    // One batched read; the per-reserve calls below then hit the cache.
    await primeTokenMetadata(reserves.map((r) => r.assetId))
    const tokens = new Map<string, TokenMetadata>()
    for (const reserve of reserves) {
      tokens.set(reserve.assetId, await getTokenMetadata(reserve.assetId))
    }
    for (const user of addresses) {
      const poolUser = await getPoolUser({ poolId, pool, userId: user })
      out.push({
        poolId,
        poolName: pool.metadata.name,
        user,
        reserves: reserves.map((reserve) =>
          readingFromSdk(
            reserve,
            poolUser,
            tokens.get(reserve.assetId) as TokenMetadata
          )
        ),
      })
    }
  }
  return out
}

const byAddresses = (addresses: string[]) => [...addresses].sort().join(',')
const readingsOnce = dedupeInFlight(byAddresses, loadReadings)
const pricedOnce = dedupeInFlight(byAddresses, async (addresses: string[]) => {
  const readings = await readingsOnce(addresses)
  const prices = await resolveRiskPrices(
    readings.flatMap((r) =>
      r.reserves.map((x) => blendPriceKey(r.poolId, x.assetId))
    )
  )
  return { readings, prices }
})

export const positionsAdapter: StellarPositionsAdapter = {
  async getUserSupplyPositions({ addresses }) {
    if (addresses.length === 0) return []
    const { readings, prices } = await pricedOnce(addresses)
    return readings.flatMap((r) => supplyPositionsFromReading(r, prices))
  },
  async getUserBorrowPositions({ addresses }) {
    if (addresses.length === 0) return []
    const { readings, prices } = await pricedOnce(addresses)
    return readings.flatMap((r) => borrowPositionsFromReading(r, prices))
  },
  async getRiskAccounts({ addresses }) {
    if (addresses.length === 0) return []
    const readings = await readingsOnce(addresses)
    return readings.flatMap((r) => riskAccountFromReading(r) ?? [])
  },
}
