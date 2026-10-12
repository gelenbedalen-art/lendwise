import { createPublicClient, http } from 'viem'

import { TX_CHAINS } from '@/config/chains'
import { chainSlugFor } from '@/lib/protocols/core/toolkit'

import type { BalanceClient } from './balance-reader'
import { EVM_CHAIN_TIMEOUT_MS, type HoldingsChain } from './wallet-holdings'
import { NATIVE_PRICE_TOKEN } from './wrapped-native'

let chains: HoldingsChain[] | undefined

/**
 * Every tx chain with a viem client on its Infura RPC, built once per server
 * instance. No JSON-RPC batching: Infura answers a rate-limited batch with
 * one id-less error that viem cannot match, so nothing is retried. Plain
 * requests keep viem's retries on -32005 and 429, and every chain has
 * multicall3, so a chain costs one `eth_call` per chunk.
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
      transport: http(chain.rpc, { timeout: EVM_CHAIN_TIMEOUT_MS }),
    }) as unknown as BalanceClient,
  }))
  return chains
}
