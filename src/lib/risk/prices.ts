import { sql } from 'drizzle-orm'

import { db } from '@/lib/db/postgres'

import { type PriceKey, priceKeyId } from './types'

/** A price older than this is no price: the spot job writes every 10 min. */
export const PRICE_MAX_AGE_HOURS = 3

/**
 * Staging lever for the "unknown" demo: product ids whose price is removed from
 * the map. Never honoured in production.
 */
export function droppedPriceProductIds(
  env: Record<string, string | undefined> = process.env
): Set<string> {
  if (env.VERCEL_ENV === 'production') return new Set()
  return new Set(
    (env.RISK_DROP_PRICE_KEYS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  )
}

export interface PriceRow {
  product_id: string
  asset_price_usd: number | string | null
  price_collateral_in_loan_asset: number | string | null
}

const positive = (v: number | string | null): number | null => {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function priceMapFromRows(
  keys: PriceKey[],
  rows: PriceRow[],
  dropped: ReadonlySet<string> = new Set()
): Map<string, number> {
  const byProduct = new Map(rows.map((r) => [r.product_id, r] as const))
  const prices = new Map<string, number>()
  for (const key of keys) {
    if (dropped.has(key.productId)) continue
    const row = byProduct.get(key.productId)
    const assetPrice = row ? positive(row.asset_price_usd) : null
    if (assetPrice == null || !row) continue
    if (key.leg === 'asset') {
      prices.set(priceKeyId(key), assetPrice)
      continue
    }
    const ratio = positive(row.price_collateral_in_loan_asset)
    if (ratio != null) prices.set(priceKeyId(key), ratio * assetPrice)
  }
  return prices
}

/**
 * The oracle price map the spot pipeline already wrote: the latest
 * `apy_hourly` row of each product, if fresher than PRICE_MAX_AGE_HOURS.
 * One query for every key; no oracle call.
 */
export async function resolveRiskPrices(
  keys: PriceKey[]
): Promise<Map<string, number>> {
  const productIds = [...new Set(keys.map((k) => k.productId))]
  if (productIds.length === 0) return new Map()

  const res = await db.execute(sql`
    SELECT DISTINCT ON (product_id) product_id,
      coalesce(last_asset_price_usd, asset_price_usd) AS asset_price_usd,
      price_collateral_in_loan_asset
    FROM apy_hourly
    WHERE product_id IN (${sql.join(
      productIds.map((id) => sql`${id}`),
      sql`, `
    )})
      AND hour >= now() - make_interval(hours => ${PRICE_MAX_AGE_HOURS})
    ORDER BY product_id, hour DESC
  `)

  return priceMapFromRows(
    keys,
    res.rows as unknown as PriceRow[],
    droppedPriceProductIds()
  )
}
