/**
 * Node providers and the URL of each network they serve. Pure: no
 * environment access, so both the browser config (`chains.ts`) and the server
 * config (`rpc.server.ts`) build on it. Switching provider means adding a
 * table here and changing variables, nothing else.
 */

/** Networks reached over RPC: every tx chain (registry slugs) and Stellar's Soroban RPC. */
export const RPC_NETWORKS = [
  'ethereum',
  'arbitrum',
  'optimism',
  'polygon',
  'base',
  'linea',
  'avalanche',
  'bsc',
  'celo',
  'zksync',
  'mantle',
  'scroll',
  'unichain',
  'hyperevm',
  'megaeth',
  'monad',
  'stellar',
] as const
export type RpcNetwork = (typeof RPC_NETWORKS)[number]

export const RPC_PROVIDERS = ['infura'] as const
export type RpcProvider = (typeof RPC_PROVIDERS)[number]

interface ProviderTable {
  /** Provider-side network name; null = not served by this provider. */
  networks: Record<RpcNetwork, string | null>
  url(network: string, key: string): string
}

const PROVIDERS: Record<RpcProvider, ProviderTable> = {
  infura: {
    networks: {
      ethereum: 'mainnet',
      arbitrum: 'arbitrum-mainnet',
      optimism: 'optimism-mainnet',
      polygon: 'polygon-mainnet',
      base: 'base-mainnet',
      linea: 'linea-mainnet',
      avalanche: 'avalanche-mainnet',
      bsc: 'bsc-mainnet',
      celo: 'celo-mainnet',
      zksync: 'zksync-mainnet',
      mantle: 'mantle-mainnet',
      scroll: 'scroll-mainnet',
      unichain: 'unichain-mainnet',
      hyperevm: 'hyperevm-mainnet',
      megaeth: 'megaeth-mainnet',
      monad: 'monad-mainnet',
      stellar: 'stellar-mainnet',
    },
    url: (network, key) => `https://${network}.infura.io/v3/${key}`,
  },
}

const NETWORKS: ReadonlySet<string> = new Set(RPC_NETWORKS)

export function isRpcNetwork(value: string): value is RpcNetwork {
  return NETWORKS.has(value)
}

export function isRpcProvider(value: string | undefined): value is RpcProvider {
  return value !== undefined && Object.hasOwn(PROVIDERS, value)
}

/** The provider's URL for a network, or null when it does not serve it. */
export function rpcUrl(
  provider: RpcProvider,
  network: RpcNetwork,
  key: string
): string | null {
  if (!key) throw new Error(`RPC key for ${provider} is empty`)
  const table = PROVIDERS[provider]
  const name = table.networks[network]
  return name === null ? null : table.url(name, key)
}
