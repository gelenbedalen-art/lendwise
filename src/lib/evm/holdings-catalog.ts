import { sql } from 'drizzle-orm'
import { type Address, isAddress } from 'viem'

import { db } from '@/lib/db/postgres'
import { PRICE_MAX_AGE_HOURS } from '@/lib/risk/prices'

import { NATIVE_ERC20_ALIASES } from './wrapped-native'

/** A token of the products catalogue, as read on one chain. */
export interface CatalogToken {
  chainId: number
  /** Lowercase. */
  address: Address
  symbol: string
  decimals: number
}

export interface CatalogTokenRow {
  chain_id: number | string
  address: string
  symbol: string
  decimals: number | string
  products: number | string
}

export interface HoldingPriceRow {
  chain_id: number | string
  address: string
  price_usd: number | string | null
}

/** `chainId:lowercase address` — the key of the holdings price map. */
export function holdingPriceKey(chainId: number, address: string): string {
  return `${chainId}:${address.toLowerCase()}`
}

const aliases = NATIVE_ERC20_ALIASES as Record<number, string | undefined>

/** One token per chain and address; the row most products share wins. */
export function tokensFromRows(rows: CatalogTokenRow[]): CatalogToken[] {
  const best = new Map<string, { token: CatalogToken; products: number }>()
  for (const row of rows) {
    const chainId = Number(row.chain_id)
    const address = row.address.toLowerCase()
    const decimals = Number(row.decimals)
    if (!isAddress(address, { strict: false })) continue
    if (!Number.isInteger(decimals) || decimals < 0) continue
    if (aliases[chainId] === address) continue
    const key = holdingPriceKey(chainId, address)
    const products = Number(row.products)
    const current = best.get(key)
    if (current && current.products >= products) continue
    best.set(key, {
      token: {
        chainId,
        address: address as Address,
        symbol: row.symbol,
        decimals,
      },
      products,
    })
  }
  return [...best.values()].map((b) => b.token)
}

export function holdingPriceMap(rows: HoldingPriceRow[]): Map<string, number> {
  const prices = new Map<string, number>()
  for (const row of rows) {
    if (row.price_usd == null) continue
    const price = Number(row.price_usd)
    if (!Number.isFinite(price) || price <= 0) continue
    prices.set(holdingPriceKey(Number(row.chain_id), row.address), price)
  }
  return prices
}

/** Tokens of the active products on these chains. */
export async function loadCatalogTokens(
  chainIds: number[]
): Promise<CatalogToken[]> {
  if (chainIds.length === 0) return []
  const res = await db.execute(sql`
    SELECT chain_id, lower(asset_address) AS address, asset_symbol AS symbol,
      asset_decimals AS decimals, count(*) AS products
    FROM products
    WHERE active AND chain_id IN (${sql.join(
      chainIds.map((id) => sql`${id}`),
      sql`, `
    )})
    GROUP BY chain_id, lower(asset_address), asset_symbol, asset_decimals
    ORDER BY chain_id, address, products DESC, symbol
  `)
  return tokensFromRows(res.rows as unknown as CatalogTokenRow[])
}

/**
 * Latest USD price of each token on its chain, from the hourly spot rows of
 * any product carrying it — no older than PRICE_MAX_AGE_HOURS. One query.
 */
export async function loadHoldingPrices(
  tokens: { chainId: number; address: string }[]
): Promise<Map<string, number>> {
  if (tokens.length === 0) return new Map()
  const pairs = sql.join(
    tokens.map(
      (t) => sql`(${t.chainId}::int, ${t.address.toLowerCase()}::text)`
    ),
    sql`, `
  )
  const res = await db.execute(sql`
    SELECT DISTINCT ON (p.chain_id, lower(p.asset_address))
      p.chain_id, lower(p.asset_address) AS address,
      coalesce(h.last_asset_price_usd, h.asset_price_usd) AS price_usd
    FROM apy_hourly h
    JOIN products p ON p.id = h.product_id
    WHERE (p.chain_id, lower(p.asset_address)) IN (${pairs})
      AND h.hour >= now() - make_interval(hours => ${PRICE_MAX_AGE_HOURS})
      AND coalesce(h.last_asset_price_usd, h.asset_price_usd) > 0
    ORDER BY p.chain_id, lower(p.asset_address), h.hour DESC
  `)
  return holdingPriceMap(res.rows as unknown as HoldingPriceRow[])
}
