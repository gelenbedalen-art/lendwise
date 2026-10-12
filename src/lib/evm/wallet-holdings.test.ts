import type { Address } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BalanceClient, ChainBalances } from './balance-reader'
import type { CatalogToken } from './holdings-catalog'
import { type HoldingsChain, getEvmWalletHoldings } from './wallet-holdings'

// holdings-catalog.ts (holdingPriceKey) imports the database client at load.
vi.mock('@/lib/db/postgres', () => ({ db: { execute: vi.fn() } }))

const A = '0x00000000000000000000000000000000000000A1' as Address
const USDC = '0x176211869ca2b568f2a7d4ee941e073a821ee1ff' as Address
const WETH = '0xe5d7c2a44ffddf6b295a15c148167daaaf5cf34f' as Address
const DUST = '0x0000000000000000000000000000000000000d05' as Address

const chain = (
  id: number,
  slug: string,
  over: Partial<HoldingsChain> = {}
): HoldingsChain => ({
  id,
  slug,
  nativeSymbol: 'ETH',
  nativeDecimals: 18,
  multicall3: null,
  nativePriceToken: null,
  client: { id: slug } as unknown as BalanceClient,
  ...over,
})

const linea = chain(59144, 'linea', { nativePriceToken: WETH })
const monad = chain(143, 'monad', { nativeSymbol: 'MON' })

const tokens: CatalogToken[] = [
  { chainId: 59144, address: USDC, symbol: 'USDC', decimals: 6 },
  { chainId: 59144, address: DUST, symbol: 'DUST', decimals: 18 },
]

const prices = new Map([
  [`59144:${USDC}`, 1],
  [`59144:${WETH}`, 2000],
])

const lineaBalances: ChainBalances = {
  native: [1_500_000_000_000_000_000n],
  tokens: [[2_500_000n, 10n]],
}

function deps(read: (c: BalanceClient) => Promise<ChainBalances>, over = {}) {
  return {
    chains: [linea, monad],
    tokens: vi.fn(async () => tokens),
    prices: vi.fn(async () => prices),
    read: vi.fn((c: BalanceClient) => read(c)),
    chainTimeoutMs: 50,
    ...over,
  }
}

const byChain =
  (m: Record<string, ChainBalances | Error | 'hang'>) =>
  async (c: BalanceClient) => {
    const v = m[(c as unknown as { id: string }).id]
    if (v === 'hang') return new Promise<ChainBalances>(() => {})
    if (v instanceof Error) throw v
    return v
  }

describe('getEvmWalletHoldings', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('turns balances into priced holdings, skipping zero and dust', async () => {
    const d = deps(
      byChain({ linea: lineaBalances, monad: { native: [0n], tokens: [[]] } })
    )
    const r = await getEvmWalletHoldings([A], d)
    expect(r.failedNetworks).toEqual([])
    expect(r.holdings).toEqual([
      {
        chainFamily: 'evm',
        network: 'linea',
        owner: A,
        assetType: 'native',
        code: 'ETH',
        issuer: null,
        balance: 1.5,
        priceUsd: 2000,
        valueUsd: 3000,
      },
      {
        chainFamily: 'evm',
        network: 'linea',
        owner: A,
        assetType: 'erc20',
        code: 'USDC',
        issuer: USDC,
        balance: 2.5,
        priceUsd: 1,
        valueUsd: 2.5,
      },
    ])
  })

  it('reads each chain with its own catalogue tokens', async () => {
    const d = deps(
      byChain({ linea: lineaBalances, monad: { native: [0n], tokens: [[]] } })
    )
    await getEvmWalletHoldings([A], d)
    expect(d.read).toHaveBeenCalledWith(linea.client, {
      owners: [A],
      tokens: [USDC, DUST],
      multicall3: null,
    })
    expect(d.read).toHaveBeenCalledWith(monad.client, {
      owners: [A],
      tokens: [],
      multicall3: null,
    })
    expect(d.prices).toHaveBeenCalledWith([
      ...tokens,
      { chainId: 59144, address: WETH },
    ])
  })

  it('leaves a native without price token unpriced', async () => {
    const d = deps(
      byChain({
        linea: { native: [0n], tokens: [[0n, 0n]] },
        monad: { native: [3n * 10n ** 18n], tokens: [[]] },
      })
    )
    const r = await getEvmWalletHoldings([A], d)
    expect(r.holdings).toEqual([
      expect.objectContaining({
        network: 'monad',
        code: 'MON',
        balance: 3,
        priceUsd: null,
        valueUsd: null,
      }),
    ])
  })

  it('keeps the other chains when one fails, and names it', async () => {
    const d = deps(
      byChain({ linea: lineaBalances, monad: new Error('rpc down') })
    )
    const r = await getEvmWalletHoldings([A], d)
    expect(r.failedNetworks).toEqual(['monad'])
    expect(r.holdings.map((h) => h.code)).toEqual(['ETH', 'USDC'])
  })

  it('fails a chain that does not answer in time', async () => {
    const d = deps(byChain({ linea: lineaBalances, monad: 'hang' }))
    const r = await getEvmWalletHoldings([A], d)
    expect(r.failedNetworks).toEqual(['monad'])
    expect(r.holdings).toHaveLength(2)
  })

  it('shows balances unpriced when the price read fails', async () => {
    const d = deps(
      byChain({ linea: lineaBalances, monad: { native: [0n], tokens: [[]] } }),
      {
        prices: vi.fn(async () => {
          throw new Error('db down')
        }),
      }
    )
    const r = await getEvmWalletHoldings([A], d)
    expect(r.failedNetworks).toEqual([])
    expect(r.holdings.map((h) => h.valueUsd)).toEqual([null, null])
  })

  it('rejects when the catalogue cannot be read', async () => {
    const d = deps(byChain({}), {
      tokens: vi.fn(async () => {
        throw new Error('db down')
      }),
    })
    await expect(getEvmWalletHoldings([A], d)).rejects.toThrow('db down')
  })

  it('reads nothing without an owner', async () => {
    const d = deps(byChain({}))
    expect(await getEvmWalletHoldings([], d)).toEqual({
      holdings: [],
      failedNetworks: [],
    })
    expect(d.tokens).not.toHaveBeenCalled()
    expect(d.read).not.toHaveBeenCalled()
  })
})
