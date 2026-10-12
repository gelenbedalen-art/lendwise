import { calculateHealthFactor } from './health-factor'
import { resolveRiskPrices } from './prices'
import type {
  PriceKey,
  PriceMap,
  RiskAccount,
  RiskAccountResult,
} from './types'

/**
 * Health factor of every account, from ONE price lookup. A failed lookup is an
 * empty map: every account with debt comes out `unknown`, the page still renders.
 */
export async function computeRiskAccounts(
  accounts: RiskAccount[],
  resolve: (keys: PriceKey[]) => Promise<PriceMap> = resolveRiskPrices
): Promise<RiskAccountResult[]> {
  if (accounts.length === 0) return []

  let prices: PriceMap
  try {
    prices = await resolve(
      accounts.flatMap((a) => a.reserves.map((r) => r.priceKey))
    )
  } catch (err) {
    console.error('[risk] price lookup failed:', err)
    prices = new Map()
  }

  return accounts.map((a) => ({
    id: a.id,
    protocol: a.protocol,
    poolId: a.poolId,
    user: a.user,
    result: calculateHealthFactor(a.reserves, prices),
  }))
}
