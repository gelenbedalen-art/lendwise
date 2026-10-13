import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
})
