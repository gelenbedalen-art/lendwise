import { createPublicClient, http } from 'viem'

import { TX_CHAINS } from '@/config/chains'
import { chainSlugFor } from '@/lib/protocols/core/toolkit'

import type { BalanceClient } from './balance-reader'
import { EVM_CHAIN_TIMEOUT_MS, type HoldingsChain } from './wallet-holdings'
import { NATIVE_PRICE_TOKEN } from './wrapped-native'

let chains: HoldingsChain[] | undefined

/**
 * Every tx chain with a viem client on its Infura RPC, built once per server
 * instance. JSON-RPC batching groups the natives and, on chains without
 * multicall3 (HyperEVM, MegaETH, Monad), the single `balanceOf` calls.
 */
export function holdingsChains(): HoldingsChain[] {
  chains ??= TX_CHAINS.map((chain) => ({
    id: chain.id,
    slug: chainSlugFor(chain.id) ?? String(chain.id),
    nativeSymbol: chain.nativeCurrency.symbol,
    nativeDecimals: chain.nativeCurrency.decimals,
    multicall3:
      ('contracts' in chain
        ? chain.contracts?.multicall3?.address
        : undefined) ?? null,
    nativePriceToken: NATIVE_PRICE_TOKEN[chain.id],
    client: createPublicClient({
      chain,
      transport: http(chain.rpc, {
        batch: { batchSize: 50 },
        timeout: EVM_CHAIN_TIMEOUT_MS,
      }),
    }) as unknown as BalanceClient,
  }))
  return chains
}
