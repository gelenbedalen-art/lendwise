import { describe, expect, it, vi } from 'vitest'

import type { RiskAccount } from '@/lib/risk/types'
import type { BorrowPosition, SupplyPosition } from '@/types'

import { type PortfolioDeps, type PositionsSource, loadPortfolio } from './load'

const G = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'
const EVM = '0x52908400098527886E0F7030069857D2E4169EE7'
const wallets = [
  { address: EVM, chainFamily: 'evm' as const },
  { address: G, chainFamily: 'stellar' as const },
]

const supply = (id: string) => ({ id }) as SupplyPosition
const account = (id: string) => ({ id, reserves: [] }) as unknown as RiskAccount

function source<A extends string>(
  rows: SupplyPosition[],
  risk: RiskAccount[] = []
): PositionsSource<A> & { calls: A[][] } {
  const calls: A[][] = []
  return {
    calls,
    getUserSupplyPositions: async ({ addresses }) => {
      calls.push(addresses)
      return rows
    },
    getUserBorrowPositions: async () => [] as BorrowPosition[],
    getRiskAccounts: async () => risk,
  }
}

const failing = (message: string): PositionsSource<string> => ({
  getUserSupplyPositions: async () => {
    throw new Error(message)
  },
  getUserBorrowPositions: async () => {
    throw new Error(message)
  },
})

function deps(overrides: Partial<PortfolioDeps> = {}): PortfolioDeps {
  return {
    evmAdapters: { aave_v3: async () => source([supply('aave')]) },
    stellarAdapters: { 'blend_v2.1': async () => source([supply('blend')]) },
    stellarHoldings: async () => [],
    computeRisk: async (accounts) =>
      accounts.map((a) => ({
        id: a.id,
        protocol: 'p',
        poolId: 'x',
        user: 'u',
        result: { status: 'no-liability' },
      })),
    ...overrides,
  }
}

describe('loadPortfolio', () => {
  it('keeps the EVM side and reports the Stellar adapter that failed', async () => {
    const result = await loadPortfolio(
      wallets,
      deps({
        stellarAdapters: {
          'blend_v2.1': async () => failing('RPC unreachable'),
        },
      })
    )
    expect(result.positions.supply.aave_v3).toEqual([supply('aave')])
    expect(result.failures).toEqual([
      {
        chainFamily: 'stellar',
        source: 'blend_v2.1',
        message: 'RPC unreachable',
      },
    ])
  })

  it('reports Horizon failures under the wallet source', async () => {
    const result = await loadPortfolio(
      wallets,
      deps({
        stellarHoldings: async () => {
          throw new Error('Horizon 503')
        },
      })
    )
    expect(result.positions.supply['blend_v2.1']).toEqual([supply('blend')])
    expect(result.failures).toEqual([
      {
        chainFamily: 'stellar',
        source: 'stellar_wallet',
        message: 'Horizon 503',
      },
    ])
  })

  it('hands each family only its own addresses', async () => {
    const evm = source<`0x${string}`>([])
    const stellar = source<string>([])
    await loadPortfolio(
      wallets,
      deps({
        evmAdapters: { aave_v3: async () => evm },
        stellarAdapters: { 'blend_v2.1': async () => stellar },
      })
    )
    expect(evm.calls).toEqual([[EVM]])
    expect(stellar.calls).toEqual([[G]])
  })

  it('computes risk on the accounts of both families', async () => {
    const computeRisk = vi.fn(async () => [])
    await loadPortfolio(
      wallets,
      deps({
        evmAdapters: { morpho_v1: async () => source([], [account('evm-1')]) },
        stellarAdapters: {
          'blend_v2.1': async () => source([], [account('xlm-1')]),
        },
        computeRisk,
      })
    )
    expect(computeRisk).toHaveBeenCalledWith([
      account('evm-1'),
      account('xlm-1'),
    ])
  })

  it('calls nothing without wallets', async () => {
    const stellarHoldings = vi.fn()
    const result = await loadPortfolio([], deps({ stellarHoldings }))
    expect(result).toEqual({
      positions: { supply: {}, borrow: {} },
      holdings: [],
      riskAccounts: [],
      failures: [],
    })
    expect(stellarHoldings).not.toHaveBeenCalled()
  })
})
