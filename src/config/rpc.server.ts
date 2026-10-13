import 'server-only'

import { type RpcNetwork, isRpcProvider, rpcUrl } from './rpc-providers'

/** Where the server reaches one network, and how it authenticates there. */
export interface ServerRpc {
  url: string
  /** The key's secret as Basic auth; empty when no secret is configured. */
  headers: Record<string, string>
}

/**
 * `RPC_URL_<SLUG>`: a full URL that replaces the provider's for one network,
 * with its own optional secret in `RPC_URL_<SLUG>_SECRET`.
 */
export function rpcOverrideVar(network: RpcNetwork): string {
  return `RPC_URL_${network.toUpperCase()}`
}

/** A key secret as the Basic auth header Infura expects; none without one. */
function basicAuth(secret: string | undefined): Record<string, string> {
  return secret
    ? { Authorization: `Basic ${Buffer.from(`:${secret}`).toString('base64')}` }
    : {}
}

/**
 * Server RPC of a network. An override URL wins, authenticated only by its
 * own `RPC_URL_<SLUG>_SECRET` — the provider's secret never goes to another
 * host. Otherwise the provider URL with the server key, and the key's secret
 * as Basic auth when set. Null when the provider does not serve the network.
 */
export function resolveServerRpc(
  network: RpcNetwork,
  env: Record<string, string | undefined>
): ServerRpc | null {
  const overrideVar = rpcOverrideVar(network)
  const override = env[overrideVar]?.trim()
  if (override) {
    return {
      url: override,
      headers: basicAuth(env[`${overrideVar}_SECRET`]?.trim()),
    }
  }

  const provider = env.NEXT_PUBLIC_RPC_PROVIDER?.trim()
  if (!isRpcProvider(provider)) {
    throw new Error(
      'NEXT_PUBLIC_RPC_PROVIDER is missing or not a known provider'
    )
  }
  const key = env.RPC_API_KEY?.trim()
  if (!key) throw new Error('RPC_API_KEY is not defined')

  const url = rpcUrl(provider, network, key)
  if (url === null) return null
  return { url, headers: basicAuth(env.RPC_API_KEY_SECRET?.trim()) }
}

/** `resolveServerRpc` on the process env, read at call time, never at import. */
export function serverRpc(network: RpcNetwork): ServerRpc | null {
  return resolveServerRpc(network, process.env)
}
