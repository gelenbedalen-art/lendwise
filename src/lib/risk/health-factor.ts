import {
  type HealthFactorResult,
  type PriceMap,
  type RiskReserve,
  priceKeyId,
} from './types'

const isAmount = (v: number) => Number.isFinite(v) && v >= 0
const isCollateralWeight = (w: number | null): w is number =>
  w != null && Number.isFinite(w) && w >= 0 && w <= 1
const isLiabilityWeight = (w: number | null): w is number =>
  w != null && Number.isFinite(w) && w > 0 && w <= 1
const unique = (xs: string[]) => [...new Set(xs)]

/**
 * Health factor of ONE isolated risk account:
 *
 *   Σ(collateral_i × price_i × collateralWeight_i)
 *   ─────────────────────────────────────────────
 *   Σ(liability_i × price_i ÷ liabilityWeight_i)
 *
 * Fails closed: an exposed reserve without a usable price makes the result
 * `unknown` — valuing it at zero would understate the risk. An account with no
 * debt cannot be liquidated, so it is `no-liability` whatever its prices.
 */
export function calculateHealthFactor(
  reserves: RiskReserve[],
  prices: PriceMap
): HealthFactorResult {
  const badAmount = reserves.filter(
    (r) => !isAmount(r.collateral) || !isAmount(r.liability)
  )
  if (badAmount.length > 0) {
    return {
      status: 'unknown',
      reason: 'invalid-amount',
      symbols: unique(badAmount.map((r) => r.symbol)),
    }
  }

  const exposed = reserves.filter((r) => r.collateral > 0 || r.liability > 0)
  if (!exposed.some((r) => r.liability > 0)) return { status: 'no-liability' }

  const badWeight = exposed.filter(
    (r) =>
      (r.collateral > 0 && !isCollateralWeight(r.collateralWeight)) ||
      (r.liability > 0 && !isLiabilityWeight(r.liabilityWeight))
  )
  if (badWeight.length > 0) {
    return {
      status: 'unknown',
      reason: 'invalid-weight',
      symbols: unique(badWeight.map((r) => r.symbol)),
    }
  }

  const priceOf = (r: RiskReserve) => prices.get(priceKeyId(r.priceKey))
  const unpriced = exposed.filter((r) => {
    const p = priceOf(r)
    return p == null || !Number.isFinite(p) || p <= 0
  })
  if (unpriced.length > 0) {
    return {
      status: 'unknown',
      reason: 'missing-price',
      symbols: unique(unpriced.map((r) => r.symbol)),
    }
  }

  let weightedCollateralUsd = 0
  let weightedLiabilityUsd = 0
  for (const r of exposed) {
    const price = priceOf(r) as number
    if (r.collateral > 0) {
      weightedCollateralUsd +=
        r.collateral * price * (r.collateralWeight as number)
    }
    if (r.liability > 0) {
      weightedLiabilityUsd +=
        (r.liability * price) / (r.liabilityWeight as number)
    }
  }

  return {
    status: 'ok',
    healthFactor: weightedCollateralUsd / weightedLiabilityUsd,
    weightedCollateralUsd,
    weightedLiabilityUsd,
  }
}
