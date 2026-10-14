import 'server-only'

import { resolveServerRpc } from '@/config/rpc.server'

import { stellarNetwork } from './stellar-network'

type Env = Record<string, string | undefined>

/**
 * Horizon of the deployment's network. `STELLAR_HORIZON_URL` stays an
 * override: the Tranche 2 degradation demo points it at a dead host.
 */
export function stellarHorizonUrl(env: Env = process.env): string {
  return env.STELLAR_HORIZON_URL?.trim() || stellarNetwork(env).horizonUrl
}

/**
 * Soroban RPC for transactions users sign (the bridge mint). Mainnet goes
 * through the server RPC and its key; testnet uses the public SDF endpoint —
 * the provider key is never sent to a testnet host.
 */
export function stellarSorobanRpc(env: Env = process.env): {
  url: string
  headers: Record<string, string>
} {
  const net = stellarNetwork(env)
  if (net.id === 'testnet') return { url: net.publicSorobanRpcUrl, headers: {} }
  return (
    resolveServerRpc('stellar', env) ?? {
      url: net.publicSorobanRpcUrl,
      headers: {},
    }
  )
}
