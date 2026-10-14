import { createPublicClient, http } from 'viem'

import { TX_CHAINS } from '@/config/chains'
import { type RpcNetwork, isRpcNetwork } from '@/config/rpc-providers'
import { serverRpc } from '@/config/rpc.server'
import { chainSlugFor } from '@/lib/protocols/core/toolkit'

import type { BalanceClient } from './balance-reader'
import {
  EVM_RPC_RETRY_DELAY_MS,
  EVM_RPC_TIMEOUT_MS,
  type HoldingsChain,
} from './wallet-holdings'
import { NATIVE_PRICE_TOKEN } from './wrapped-native'

/** A client for a chain with no server RPC: every read rejects with `reason`. */
export function unavailableClient(reason: string): BalanceClient {
  const reject = () => Promise.reject(new Error(reason))
  return {
    getBalance: reject,
    multicall: reject,
    readContract: reject,
  } as unknown as BalanceClient
}

/**
 * A fetch that adds the network's current auth headers to every request: a
 * dRPC JWT expires after an hour, the clients live as long as the instance.
 */
export function freshHeadersFetch(
  network: RpcNetwork,
  fetchImpl?: typeof fetch
): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers)
    for (const [name, value] of Object.entries(
      serverRpc(network)?.headers ?? {}
    )) {
      headers.set(name, value)
    }
    return (fetchImpl ?? fetch)(input, { ...init, headers })
  }
}

let chains: HoldingsChain[] | undefined

/**
 * Every tx chain with a viem client on the RPC provider's server key, built
 * once per server instance. Each request carries the provider's current proof
 * (Infura's Basic secret, dRPC's JWT) through `freshHeadersFetch`. No
 * JSON-RPC batching: a rate-limited batch comes back as one id-less error
 * that viem cannot match, so nothing is retried. Plain requests keep viem's
 * retries on -32005 and 429, and every chain has multicall3, so a chain costs
 * one `eth_call` per chunk. No fallback to public RPCs: the provider's plan
 * serves every network, and a user's addresses do not go to third parties.
 */
export function holdingsChains(): HoldingsChain[] {
  chains ??= TX_CHAINS.map((chain) => {
    const slug = chainSlugFor(chain.id)
    // A chain the provider does not serve is a gap of that chain alone: its
    // reads reject and it lands in `failedNetworks`. Missing provider config
    // (`serverRpc` throwing) stays a deployment error and throws for all.
    const network = slug && isRpcNetwork(slug) ? slug : undefined
    const rpc = network ? serverRpc(network) : null
    const label = slug ?? String(chain.id)
    return {
      id: chain.id,
      slug: label,
      nativeSymbol: chain.nativeCurrency.symbol,
      nativeDecimals: chain.nativeCurrency.decimals,
      multicall3:
        ('contracts' in chain
          ? chain.contracts?.multicall3?.address
          : undefined) ?? null,
      nativePriceToken: NATIVE_PRICE_TOKEN[chain.id],
      client:
        rpc && network
          ? (createPublicClient({
              chain,
              transport: http(rpc.url, {
                timeout: EVM_RPC_TIMEOUT_MS,
                retryDelay: EVM_RPC_RETRY_DELAY_MS,
                fetchFn: freshHeadersFetch(network),
              }),
            }) as unknown as BalanceClient)
          : unavailableClient(`no server RPC for ${label}`),
    }
  })
  return chains
}
