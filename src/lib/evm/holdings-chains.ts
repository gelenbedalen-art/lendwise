import { createPublicClient, fallback, http } from 'viem'

import { TX_CHAINS } from '@/config/chains'
import { chainSlugFor } from '@/lib/protocols/core/toolkit'

import type { BalanceClient } from './balance-reader'
import { holdingsRpcUrls } from './rpc-urls'
import { EVM_RPC_TIMEOUT_MS, type HoldingsChain } from './wallet-holdings'
import { NATIVE_PRICE_TOKEN } from './wrapped-native'

function transportFor(urls: string[]) {
  const transports = urls.map((u) => http(u, { timeout: EVM_RPC_TIMEOUT_MS }))
  return transports.length === 1 ? transports[0] : fallback(transports)
}

let chains: HoldingsChain[] | undefined

/**
 * Every tx chain with a viem client on its Infura RPC, built once per server
 * instance. No JSON-RPC batching: Infura answers a rate-limited batch with
 * one id-less error that viem cannot match, so nothing is retried. Plain
 * requests keep viem's retries on -32005 and 429, and every chain has
 * multicall3, so a chain costs one `eth_call` per chunk. Infura comes first;
 * the chain's public RPC takes over on a 429 or any other non-revert error,
 * because Infura serves some networks (Celo, zkSync) to this key with a lower
 * limit. The addresses read are public on-chain data.
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
      transport: transportFor(
        holdingsRpcUrls(chain.rpc, chain.rpcUrls.default.http)
      ),
    }) as unknown as BalanceClient,
  }))
  return chains
}
