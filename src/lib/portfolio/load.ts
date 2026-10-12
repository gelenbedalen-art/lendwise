import type { Address } from 'viem'

import type { RiskAccount, RiskAccountResult } from '@/lib/risk/types'
import type { BorrowPosition, SupplyPosition, UserPosition } from '@/types'

import { routePortfolioWallets } from './routing'
import {
  type PortfolioChainFamily,
  type PortfolioPartialFailure,
  type PortfolioWalletInput,
  STELLAR_WALLET_SOURCE,
  type StellarHolding,
  type UserPortfolioResult,
  emptyUserPositions,
  mergeUserPositions,
} from './types'

/** What the merge needs from any adapter, EVM or Stellar. */
export interface PositionsSource<A extends string> {
  getUserSupplyPositions(p: { addresses: A[] }): Promise<SupplyPosition[]>
  getUserBorrowPositions(p: { addresses: A[] }): Promise<BorrowPosition[]>
  getRiskAccounts?(p: { addresses: A[] }): Promise<RiskAccount[]>
}

type Loaders<A extends string> = Record<
  string,
  () => Promise<PositionsSource<A>>
>

export interface PortfolioDeps {
  evmAdapters: Loaders<Address>
  stellarAdapters: Loaders<string>
  stellarHoldings(addresses: string[]): Promise<StellarHolding[]>
  computeRisk(accounts: RiskAccount[]): Promise<RiskAccountResult[]>
}

interface FamilyResult {
  positions: UserPosition
  riskAccounts: RiskAccount[]
  holdings: StellarHolding[]
  failures: PortfolioPartialFailure[]
}

const emptyFamily = (): FamilyResult => ({
  positions: emptyUserPositions(),
  riskAccounts: [],
  holdings: [],
  failures: [],
})

const GENERIC_FAILURE_MESSAGE = 'Temporarily unavailable'

/**
 * Upstream errors can carry RPC URLs with keys or internal hosts: the raw
 * reason stays in the server logs, the client only gets a generic message.
 */
function failure(
  chainFamily: PortfolioChainFamily,
  source: string,
  reason: unknown
): PortfolioPartialFailure {
  console.error(`[portfolio] ${chainFamily}/${source} failed:`, reason)
  return { chainFamily, source, message: GENERIC_FAILURE_MESSAGE }
}

/** Every adapter of a family, each settled on its own. */
async function loadAdapters<A extends string>(
  chainFamily: PortfolioChainFamily,
  addresses: A[],
  adapters: Loaders<A>
): Promise<FamilyResult> {
  const result = emptyFamily()
  if (addresses.length === 0) return result

  const entries = Object.entries(adapters)
  const settled = await Promise.allSettled(
    entries.map(async ([, load]) => {
      const adapter = await load()
      // Concurrent on purpose: adapters dedupe the shared upstream read.
      // Risk settles apart: its failure must not discard good positions.
      const riskRead = Promise.resolve(
        adapter.getRiskAccounts
          ? adapter.getRiskAccounts({ addresses })
          : ([] as RiskAccount[])
      ).then(
        (value) => ({ ok: true as const, value }),
        (reason: unknown) => ({ ok: false as const, reason })
      )
      const [supply, borrow] = await Promise.all([
        adapter.getUserSupplyPositions({ addresses }),
        adapter.getUserBorrowPositions({ addresses }),
      ])
      return { supply, borrow, risk: await riskRead }
    })
  )

  settled.forEach((s, i) => {
    const source = entries[i][0]
    if (s.status === 'fulfilled') {
      result.positions.supply[source] = s.value.supply
      result.positions.borrow[source] = s.value.borrow
      if (s.value.risk.ok) result.riskAccounts.push(...s.value.risk.value)
      else
        result.failures.push(failure(chainFamily, source, s.value.risk.reason))
    } else {
      result.failures.push(failure(chainFamily, source, s.reason))
    }
  })
  return result
}

async function loadStellar(
  addresses: string[],
  deps: PortfolioDeps
): Promise<FamilyResult> {
  if (addresses.length === 0) return emptyFamily()
  const [adapters, holdings] = await Promise.allSettled([
    loadAdapters('stellar', addresses, deps.stellarAdapters),
    deps.stellarHoldings(addresses),
  ])
  const result =
    adapters.status === 'fulfilled' ? adapters.value : emptyFamily()
  if (adapters.status === 'rejected') {
    result.failures.push(failure('stellar', 'stellar', adapters.reason))
  }
  if (holdings.status === 'fulfilled') result.holdings = holdings.value
  else {
    result.failures.push(
      failure('stellar', STELLAR_WALLET_SOURCE, holdings.reason)
    )
  }
  return result
}

/**
 * EVM and Stellar positions in one result. Each family — and each source in
 * it — settles on its own: a source that rejects becomes a partial failure and
 * the rest of the portfolio still renders.
 */
export async function loadPortfolio(
  wallets: PortfolioWalletInput[],
  deps: PortfolioDeps
): Promise<UserPortfolioResult> {
  const { evmAddresses, stellarAddresses } = routePortfolioWallets(wallets)

  const families: [PortfolioChainFamily, () => Promise<FamilyResult>][] = [
    ['evm', () => loadAdapters('evm', evmAddresses, deps.evmAdapters)],
    ['stellar', () => loadStellar(stellarAddresses, deps)],
  ]
  const settled = await Promise.allSettled(families.map(([, run]) => run()))

  const loaded: FamilyResult[] = []
  const failures: PortfolioPartialFailure[] = []
  settled.forEach((s, i) => {
    const chainFamily = families[i][0]
    if (s.status === 'fulfilled') {
      loaded.push(s.value)
      failures.push(...s.value.failures)
    } else {
      failures.push(failure(chainFamily, chainFamily, s.reason))
    }
  })

  const accounts = loaded.flatMap((f) => f.riskAccounts)
  let riskAccounts: RiskAccountResult[] = []
  if (accounts.length > 0) {
    try {
      riskAccounts = await deps.computeRisk(accounts)
    } catch (reason) {
      console.error('[portfolio] risk computation failed:', reason)
    }
  }
  return {
    positions: mergeUserPositions(...loaded.map((f) => f.positions)),
    holdings: loaded.flatMap((f) => f.holdings),
    riskAccounts,
    failures,
  }
}
