import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { activeProductIds } from '@/lib/db/repositories/products'

import { client, getRiskAccounts, getUserBorrowPositions } from '../positions'
import { buildProductId } from '../utils'

vi.mock('@/lib/db/repositories/products', () => ({
  activeProductIds: vi.fn(),
}))

const USER = '0xAbC0000000000000000000000000000000000001'

const borrowItem = (marketId: string, withCollateral = true) => ({
  id: `pos-${marketId}`,
  healthFactor: 1.4,
  user: { address: USER },
  market: {
    marketId,
    lltv: '860000000000000000',
    collateralAsset: withCollateral
      ? {
          symbol: 'wstETH',
          decimals: 18,
          address: '0x1',
          name: 'wstETH',
        }
      : null,
    loanAsset: { symbol: 'WETH', decimals: 18, address: '0x2', name: 'WETH' },
    morphoBlue: { chain: { id: 1, network: 'ethereum' } },
    state: { avgBorrowApy: 0.03 },
  },
  state: {
    collateral: '2000000000000000000',
    collateralUsd: 5000,
    borrowAssets: 1.5e18,
    borrowAssetsUsd: 3000,
  },
})

const inCatalogue = buildProductId(1, '0xcatalogued', 'borrow')

function mockRead(items: ReturnType<typeof borrowItem>[]) {
  vi.spyOn(client, 'query').mockReturnValue({
    toPromise: async () => ({
      data: {
        marketPositions: {
          items,
          pageInfo: { countTotal: items.length, count: items.length },
        },
      },
    }),
  } as never)
}

describe('Morpho borrow risk accounts follow the catalogue', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(activeProductIds).mockReset()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('gives a catalogued market an id and an account', async () => {
    mockRead([borrowItem('0xcatalogued')])
    vi.mocked(activeProductIds).mockResolvedValue(new Set([inCatalogue]))
    const rows = await getUserBorrowPositions({ addresses: [USER as never] })
    const accounts = await getRiskAccounts({ addresses: [USER as never] })
    expect(rows[0].riskAccountId).toBe(accounts[0].id)
    expect(accounts).toHaveLength(1)
    expect(activeProductIds).toHaveBeenCalledWith([inCatalogue])
  })

  it('gives an uncatalogued market neither id nor account', async () => {
    mockRead([borrowItem('0xother')])
    vi.mocked(activeProductIds).mockResolvedValue(new Set())
    const rows = await getUserBorrowPositions({ addresses: [USER as never] })
    expect(rows).toHaveLength(1)
    expect(rows[0].riskAccountId).toBeUndefined()
    expect(await getRiskAccounts({ addresses: [USER as never] })).toEqual([])
  })

  it('gives an idle market (no collateral asset) no id', async () => {
    mockRead([borrowItem('0xcatalogued', false)])
    vi.mocked(activeProductIds).mockResolvedValue(new Set([inCatalogue]))
    const rows = await getUserBorrowPositions({ addresses: [USER as never] })
    expect(rows[0].riskAccountId).toBeUndefined()
    expect(await getRiskAccounts({ addresses: [USER as never] })).toEqual([])
  })

  it('keeps positions without risk when the catalogue lookup fails', async () => {
    mockRead([borrowItem('0xcatalogued')])
    vi.mocked(activeProductIds).mockRejectedValue(new Error('db down'))
    const rows = await getUserBorrowPositions({ addresses: [USER as never] })
    expect(rows).toHaveLength(1)
    expect(rows[0].healthFactor).toBe(1.4)
    expect(rows[0].riskAccountId).toBeUndefined()
    expect(await getRiskAccounts({ addresses: [USER as never] })).toEqual([])
    expect(console.error).toHaveBeenCalledWith(
      '[morpho] catalogue lookup failed:',
      expect.any(Error)
    )
  })
})
