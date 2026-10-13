import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { rpcUrl } from '@/config/rpc-providers'
import { chainSlugFor } from '@/lib/protocols/core/toolkit/chain-slugs'

async function load() {
  vi.resetModules()
  return import('./chains')
}

describe('chains browser RPC config', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('builds every tx chain URL from the browser key, never the server key', async () => {
    vi.stubEnv('NEXT_PUBLIC_RPC_PROVIDER', 'infura')
    vi.stubEnv('NEXT_PUBLIC_RPC_API_KEY', 'browser-key')
    vi.stubEnv('RPC_API_KEY', 'server-key')
    const { TX_CHAINS } = await load()
    expect(TX_CHAINS.length).toBeGreaterThan(0)
    for (const chain of TX_CHAINS) {
      expect(chain.rpc).toContain('browser-key')
      expect(chain.rpc).not.toContain('server-key')
    }
  })

  it('rejects when NEXT_PUBLIC_RPC_API_KEY is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_RPC_PROVIDER', 'infura')
    vi.stubEnv('NEXT_PUBLIC_RPC_API_KEY', '')
    await expect(load()).rejects.toThrow(/NEXT_PUBLIC_RPC_API_KEY/)
  })

  it('rejects when NEXT_PUBLIC_RPC_PROVIDER is unknown', async () => {
    vi.stubEnv('NEXT_PUBLIC_RPC_PROVIDER', 'nope')
    vi.stubEnv('NEXT_PUBLIC_RPC_API_KEY', 'browser-key')
    await expect(load()).rejects.toThrow(/NEXT_PUBLIC_RPC_PROVIDER/)
  })

  it('rejects when NEXT_PUBLIC_RPC_PROVIDER is unset', async () => {
    vi.stubEnv('NEXT_PUBLIC_RPC_PROVIDER', '')
    vi.stubEnv('NEXT_PUBLIC_RPC_API_KEY', 'browser-key')
    await expect(load()).rejects.toThrow(/NEXT_PUBLIC_RPC_PROVIDER/)
  })

  it('never hands the browser key to a wallet through rpcUrls.default', async () => {
    vi.stubEnv('NEXT_PUBLIC_RPC_PROVIDER', 'infura')
    vi.stubEnv('NEXT_PUBLIC_RPC_API_KEY', 'browser-key')
    const { TX_CHAINS } = await load()
    expect(TX_CHAINS).toHaveLength(16)
    for (const chain of TX_CHAINS) {
      for (const url of chain.rpcUrls.default.http) {
        expect(url).not.toContain('browser-key')
      }
    }
  })

  it('keeps the keyed browser URL in rpc for every chain', async () => {
    vi.stubEnv('NEXT_PUBLIC_RPC_PROVIDER', 'infura')
    vi.stubEnv('NEXT_PUBLIC_RPC_API_KEY', 'browser-key')
    const { TX_CHAINS } = await load()
    for (const chain of TX_CHAINS) {
      const slug = chainSlugFor(chain.id)
      expect(slug).toBeDefined()
      expect(chain.rpc).toBe(
        rpcUrl('infura', slug as Parameters<typeof rpcUrl>[1], 'browser-key')
      )
    }
  })
})
