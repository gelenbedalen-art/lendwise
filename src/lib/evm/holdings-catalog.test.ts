import { beforeEach, describe, expect, it, vi } from 'vitest'

import { issuedSql } from '@/lib/db/__tests__/issued-sql'

import {
  holdingPriceKey,
  holdingPriceMap,
  loadCatalogTokens,
  loadHoldingPrices,
  tokensFromRows,
} from './holdings-catalog'
import { NATIVE_PRICE_TOKEN } from './wrapped-native'

const execute = vi.hoisted(() => vi.fn())
vi.mock('@/lib/db/postgres', () => ({ db: { execute } }))

const USDC = '0x176211869ca2b568f2a7d4ee941e073a821ee1ff'
const CELO = '0x471ece3750da237f93b8e339c536989b8978a438'

describe('holdingPriceKey', () => {
  it('lowercases the address', () => {
    expect(holdingPriceKey(59144, '0xABC')).toBe('59144:0xabc')
  })
})

describe('tokensFromRows', () => {
  it('keeps one token per chain and address, the most common row winning', () => {
    expect(
      tokensFromRows([
        {
          chain_id: 59144,
          address: USDC,
          symbol: 'USDC.e',
          decimals: 6,
          products: 1,
        },
        {
          chain_id: '59144',
          address: USDC.toUpperCase().replace('0X', '0x'),
          symbol: 'USDC',
          decimals: '6',
          products: '4',
        },
        {
          chain_id: 8453,
          address: USDC,
          symbol: 'USDC',
          decimals: 6,
          products: 1,
        },
      ])
    ).toEqual([
      { chainId: 59144, address: USDC, symbol: 'USDC', decimals: 6 },
      { chainId: 8453, address: USDC, symbol: 'USDC', decimals: 6 },
    ])
  })

  it('drops invalid addresses, invalid decimals and the CELO alias of the native', () => {
    expect(
      tokensFromRows([
        {
          chain_id: 1,
          address: 'not-an-address',
          symbol: 'X',
          decimals: 18,
          products: 1,
        },
        { chain_id: 1, address: USDC, symbol: 'Y', decimals: -1, products: 1 },
        {
          chain_id: 42220,
          address: CELO,
          symbol: 'CELO',
          decimals: 18,
          products: 1,
        },
      ])
    ).toEqual([])
  })
})

describe('NATIVE_PRICE_TOKEN', () => {
  it('prices Polygon with WPOL, Celo with CELO, and leaves Monad unpriced', () => {
    expect(NATIVE_PRICE_TOKEN[137]).toBe(
      '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270'
    )
    expect(NATIVE_PRICE_TOKEN[42220]).toBe(CELO)
    expect(NATIVE_PRICE_TOKEN[143]).toBeNull()
  })
})

describe('holdingPriceMap', () => {
  it('keys positive prices by chain and lowercase address', () => {
    const map = holdingPriceMap([
      { chain_id: '59144', address: USDC, price_usd: '0.9998' },
      { chain_id: 1, address: '0xAAA', price_usd: 0 },
      { chain_id: 1, address: '0xbbb', price_usd: null },
    ])
    expect(map).toEqual(new Map([[`59144:${USDC}`, 0.9998]]))
  })
})

describe('loadCatalogTokens', () => {
  beforeEach(() => execute.mockReset())

  it('skips the database without chains', async () => {
    expect(await loadCatalogTokens([])).toEqual([])
    expect(execute).not.toHaveBeenCalled()
  })

  it('reads active products of the chains in one query', async () => {
    execute.mockResolvedValue({
      rows: [
        {
          chain_id: 59144,
          address: USDC,
          symbol: 'USDC',
          decimals: 6,
          products: 2,
        },
      ],
    })
    expect(await loadCatalogTokens([59144])).toEqual([
      { chainId: 59144, address: USDC, symbol: 'USDC', decimals: 6 },
    ])
    const q = issuedSql(execute)
    expect(q).toContain('FROM products')
    expect(q).toContain('WHERE active AND chain_id IN')
  })
})

describe('loadHoldingPrices', () => {
  beforeEach(() => execute.mockReset())

  it('skips the database without tokens', async () => {
    expect(await loadHoldingPrices([])).toEqual(new Map())
    expect(execute).not.toHaveBeenCalled()
  })

  it('reads the latest fresh price per chain and address', async () => {
    execute.mockResolvedValue({
      rows: [{ chain_id: 59144, address: USDC, price_usd: 1 }],
    })
    const map = await loadHoldingPrices([{ chainId: 59144, address: USDC }])
    expect(map.get(`59144:${USDC}`)).toBe(1)
    const q = issuedSql(execute)
    expect(q).toContain('DISTINCT ON (p.chain_id, lower(p.asset_address))')
    expect(q).toContain('coalesce(h.last_asset_price_usd, h.asset_price_usd)')
    expect(q).toContain('h.hour >= now() - make_interval(hours =>')
    expect(q).toContain(
      'ORDER BY p.chain_id, lower(p.asset_address), h.hour DESC, p.id'
    )
  })
})
