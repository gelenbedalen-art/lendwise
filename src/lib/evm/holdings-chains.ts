import { createPublicClient, http } from 'viem'

import { TX_CHAINS } from '@/config/chains'
import { isRpcNetwork } from '@/config/rpc-providers'
import { serverRpc } from '@/config/rpc.server'
import { chainSlugFor } from '@/lib/protocols/core/toolkit'

import type { BalanceClient } from './balance-reader'
import { EVM_RPC_TIMEOUT_MS, type HoldingsChain } from './wallet-holdings'
import { NATIVE_PRICE_TOKEN } from './wrapped-native'

let chains: HoldingsChain[] | undefined

/**
 * Every tx chain with a viem client on the RPC provider's server key, built
 * once per server instance. The key's secret travels as Basic auth. No
 * JSON-RPC batching: a rate-limited batch comes back as one id-less error
 * that viem cannot match, so nothing is retried. Plain requests keep viem's
 * retries on -32005 and 429, and every chain has multicall3, so a chain costs
 * one `eth_call` per chunk. No fallback to public RPCs: the provider's plan
 * serves every network, and a user's addresses do not go to third parties.
 */
export function holdingsChains(): HoldingsChain[] {
  chains ??= TX_CHAINS.map((chain) => {
    const slug = chainSlugFor(chain.id)
    if (!slug || !isRpcNetwork(slug))
      throw new Error(`chain ${chain.id} has no RPC network`)
    const rpc = serverRpc(slug)
    if (!rpc) throw new Error(`no server RPC for ${slug}`)
    return {
      id: chain.id,
      slug,
      nativeSymbol: chain.nativeCurrency.symbol,
      nativeDecimals: chain.nativeCurrency.decimals,
      multicall3:
        ('contracts' in chain
          ? chain.contracts?.multicall3?.address
          : undefined) ?? null,
      nativePriceToken: NATIVE_PRICE_TOKEN[chain.id],
      client: createPublicClient({
        chain,
        transport: http(rpc.url, {
          timeout: EVM_RPC_TIMEOUT_MS,
          fetchOptions: { headers: rpc.headers },
        }),
      }) as unknown as BalanceClient,
    }
  })
  return chains
}
