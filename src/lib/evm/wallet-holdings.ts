import { type Address, formatUnits } from 'viem'

import type { EvmWalletHoldings, WalletHolding } from '@/lib/portfolio/types'
import { withTimeout } from '@/lib/portfolio/with-timeout'

import {
  type BalanceClient,
  type ChainBalances,
  readChainBalances,
} from './balance-reader'
import type { CatalogToken } from './holdings-catalog'
import { holdingPriceKey } from './price-key'
import { redactRpcSecrets } from './redact'
import { settleWithConcurrency } from './settle-with-concurrency'

/** One tx chain, ready to read. */
export interface HoldingsChain {
  id: number
  /** Registry slug: 'linea', 'base', … */
  slug: string
  nativeSymbol: string
  nativeDecimals: number
  multicall3: Address | null
  /** Token whose price values the native; null = unpriced. */
  nativePriceToken: Address | null
  client: BalanceClient
}

export interface EvmHoldingsDeps {
  chains: HoldingsChain[]
  tokens(chainIds: number[]): Promise<CatalogToken[]>
  prices(
    tokens: { chainId: number; address: string }[]
  ): Promise<Map<string, number>>
  /** Per-chain limit; defaults to EVM_CHAIN_TIMEOUT_MS. */
  chainTimeoutMs?: number
  /** Chains read at a time; defaults to EVM_CHAIN_CONCURRENCY. */
  concurrency?: number
  /** Whole-read budget; defaults to EVM_HOLDINGS_BUDGET_MS. */
  budgetMs?: number
  read?: typeof readChainBalances
}

/** Longest one chain may take before it counts as failed. */
export const EVM_CHAIN_TIMEOUT_MS = 8_000

/** One HTTP attempt: leaves room for viem's retries inside EVM_CHAIN_TIMEOUT_MS. */
export const EVM_RPC_TIMEOUT_MS = 3_500

/** Under SOURCE_TIMEOUT_MS (12 s), so the read returns what it has before the source limit. */
export const EVM_HOLDINGS_BUDGET_MS = 11_000

/** A chain whose turn comes with this much budget left or less is not started. */
const MIN_CHAIN_BUDGET_MS = 500

/**
 * Chains read at once: keeps a portfolio load's burst under the Infura key's
 * rate limit. `withTimeout` does not cancel the underlying RPC requests (viem
 * has no per-request abort), so during a slowdown more than this many chains'
 * requests can be in flight briefly.
 */
export const EVM_CHAIN_CONCURRENCY = 4

/** Below this a balance shows as 0 at the table's 7 decimals: not a holding. */
export const MIN_DISPLAY_BALANCE = 1e-7

interface PendingHolding {
  holding: WalletHolding
  priceKey: string | null
}

function chainHoldings(
  chain: HoldingsChain,
  owners: Address[],
  tokens: CatalogToken[],
  balances: ChainBalances
): PendingHolding[] {
  return owners.flatMap((owner, i) => {
    const assets = [
      {
        raw: balances.native[i],
        decimals: chain.nativeDecimals,
        code: chain.nativeSymbol,
        assetType: 'native' as const,
        issuer: null,
        priceKey: chain.nativePriceToken
          ? holdingPriceKey(chain.id, chain.nativePriceToken)
          : null,
      },
      ...tokens.map((t, j) => ({
        raw: balances.tokens[i]?.[j] ?? null,
        decimals: t.decimals,
        code: t.symbol,
        assetType: 'erc20' as const,
        issuer: t.address,
        priceKey: holdingPriceKey(chain.id, t.address),
      })),
    ]
    return assets.flatMap((a): PendingHolding[] => {
      if (a.raw == null || a.raw === 0n) return []
      const balance = Number(formatUnits(a.raw, a.decimals))
      if (!(balance >= MIN_DISPLAY_BALANCE)) return []
      return [
        {
          priceKey: a.priceKey,
          holding: {
            chainFamily: 'evm',
            network: chain.slug,
            owner,
            assetType: a.assetType,
            code: a.code,
            issuer: a.issuer,
            balance,
            priceUsd: null,
            valueUsd: null,
          },
        },
      ]
    })
  })
}

/**
 * Native and catalogue-token balances of every owner on every chain, a few
 * chains at a time. Each chain settles on its own, under its own time limit
 * that starts when its read starts, all within one budget: a chain that finds
 * the budget spent is not started. A failed chain is named in
 * `failedNetworks` and the others are still returned. Prices are read
 * alongside; without them the balances come back unpriced.
 */
export async function getEvmWalletHoldings(
  owners: Address[],
  deps: EvmHoldingsDeps
): Promise<EvmWalletHoldings> {
  if (owners.length === 0) return { holdings: [], failedNetworks: [] }
  const read = deps.read ?? readChainBalances
  const timeoutMs = deps.chainTimeoutMs ?? EVM_CHAIN_TIMEOUT_MS
  const deadline = Date.now() + (deps.budgetMs ?? EVM_HOLDINGS_BUDGET_MS)

  const tokens = await deps.tokens(deps.chains.map((c) => c.id))
  const priceRead = deps
    .prices([
      ...tokens,
      ...deps.chains.flatMap((c) =>
        c.nativePriceToken
          ? [{ chainId: c.id, address: c.nativePriceToken }]
          : []
      ),
    ])
    .catch((reason: unknown) => {
      console.error(
        '[portfolio] evm wallet prices failed:',
        redactRpcSecrets(reason)
      )
      return new Map<string, number>()
    })

  const settled = await settleWithConcurrency(
    deps.chains,
    deps.concurrency ?? EVM_CHAIN_CONCURRENCY,
    async (chain) => {
      const remaining = deadline - Date.now()
      if (remaining <= MIN_CHAIN_BUDGET_MS) throw new Error('budget exhausted')
      const chainTokens = tokens.filter((t) => t.chainId === chain.id)
      const balances = await withTimeout(
        read(chain.client, {
          owners,
          tokens: chainTokens.map((t) => t.address),
          multicall3: chain.multicall3,
        }),
        Math.min(timeoutMs, remaining)
      )
      return chainHoldings(chain, owners, chainTokens, balances)
    }
  )
  const prices = await priceRead

  const pending: PendingHolding[] = []
  const failedNetworks: string[] = []
  settled.forEach((s, i) => {
    const { slug } = deps.chains[i]
    if (s.status === 'fulfilled') pending.push(...s.value)
    else {
      console.error(
        `[portfolio] evm wallet ${slug} failed:`,
        redactRpcSecrets(s.reason)
      )
      failedNetworks.push(slug)
    }
  })

  return {
    holdings: pending.map(({ holding, priceKey }) => {
      const price = priceKey ? (prices.get(priceKey) ?? null) : null
      return {
        ...holding,
        priceUsd: price,
        valueUsd: price == null ? null : holding.balance * price,
      }
    }),
    failedNetworks,
  }
}
