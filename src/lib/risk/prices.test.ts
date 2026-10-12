import { beforeEach, describe, expect, it, vi } from 'vitest'

import { issuedSql } from '@/lib/db/__tests__/issued-sql'

import {
  droppedPriceProductIds,
  priceMapFromRows,
  resolveRiskPrices,
} from './prices'
import { priceKeyId } from './types'

const execute = vi.hoisted(() => vi.fn())
vi.mock('@/lib/db/postgres', () => ({ db: { execute } }))

const asset = (productId: string) => ({ productId, leg: 'asset' as const })
const collateral = (productId: string) => ({
  productId,
  leg: 'collateral' as const,
})

describe('priceMapFromRows', () => {
  it('reads the asset price and the Morpho collateral price', () => {
    const map = priceMapFromRows(
      [asset('m'), collateral('m')],
      [
        {
          product_id: 'm',
          asset_price_usd: '2',
          price_collateral_in_loan_asset: 1500,
        },
      ]
    )
    expect(map.get(priceKeyId(asset('m')))).toBe(2)
    expect(map.get(priceKeyId(collateral('m')))).toBe(3000)
  })

  it('leaves out absent rows, null and non-positive prices', () => {
    const map = priceMapFromRows(
      [asset('a'), asset('b'), asset('c'), collateral('d')],
      [
        {
          product_id: 'b',
          asset_price_usd: null,
          price_collateral_in_loan_asset: null,
        },
        {
          product_id: 'c',
          asset_price_usd: 0,
          price_collateral_in_loan_asset: null,
        },
        {
          product_id: 'd',
          asset_price_usd: 1,
          price_collateral_in_loan_asset: null,
        },
      ]
    )
    expect(map.size).toBe(0)
  })

  it('drops the configured product ids', () => {
    const map = priceMapFromRows(
      [asset('x')],
      [
        {
          product_id: 'x',
          asset_price_usd: 1,
          price_collateral_in_loan_asset: null,
        },
      ],
      new Set(['x'])
    )
    expect(map.size).toBe(0)
  })
})

describe('droppedPriceProductIds', () => {
  it('parses RISK_DROP_PRICE_KEYS outside production', () => {
    expect(
      droppedPriceProductIds({
        VERCEL_ENV: 'preview',
        RISK_DROP_PRICE_KEYS: ' a, b ,',
      })
    ).toEqual(new Set(['a', 'b']))
  })

  it('ignores it in production', () => {
    expect(
      droppedPriceProductIds({
        VERCEL_ENV: 'production',
        RISK_DROP_PRICE_KEYS: 'a',
      })
    ).toEqual(new Set())
  })
})

describe('resolveRiskPrices', () => {
  beforeEach(() => execute.mockReset())

  it('skips the database when there is no key', async () => {
    expect(await resolveRiskPrices([])).toEqual(new Map())
    expect(execute).not.toHaveBeenCalled()
  })

  it('reads the latest fresh row per product in one query', async () => {
    execute.mockResolvedValue({
      rows: [
        {
          product_id: 'p',
          asset_price_usd: 5,
          price_collateral_in_loan_asset: null,
        },
      ],
    })
    const map = await resolveRiskPrices([asset('p'), asset('p')])
    expect(execute).toHaveBeenCalledTimes(1)
    const sql = issuedSql(execute)
    expect(sql).toContain('SELECT DISTINCT ON (product_id) product_id')
    expect(sql).toContain('coalesce(last_asset_price_usd, asset_price_usd)')
    expect(sql).toContain('make_interval(hours =>')
    expect(sql).toContain('ORDER BY product_id, hour DESC')
    expect(map.get(priceKeyId(asset('p')))).toBe(5)
  })
})
