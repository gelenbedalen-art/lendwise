import type { Address } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11'

// chains.ts reads the RPC provider and keys at import: stub them before the dynamic import.
async function load() {
  vi.stubEnv('NEXT_PUBLIC_RPC_PROVIDER', 'infura')
  vi.stubEnv('NEXT_PUBLIC_RPC_API_KEY', 'browser-key')
  vi.stubEnv('RPC_API_KEY', 'server-key')
  vi.stubEnv('RPC_API_KEY_SECRET', 'server-secret')
  vi.resetModules()
  const [{ holdingsChains }, { NATIVE_PRICE_TOKEN }] = await Promise.all([
    import('./holdings-chains'),
    import('./wrapped-native'),
  ])
  return { chains: holdingsChains(), NATIVE_PRICE_TOKEN }
}

describe('holdingsChains', () => {
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.doUnmock('@/config/rpc.server')
  })

  it('builds the 16 tx chains', async () => {
    const { chains } = await load()
    expect(chains).toHaveLength(16)
  })

  it('names every chain by its registry slug, not its id', async () => {
    const { chains } = await load()
    for (const c of chains) expect(c.slug).not.toMatch(/^\d+$/)
  })

  it('gives every chain multicall3', async () => {
    const { chains } = await load()
    for (const c of chains) expect(c.multicall3).not.toBeNull()
  })

  it('takes the native price token from NATIVE_PRICE_TOKEN', async () => {
    const { chains, NATIVE_PRICE_TOKEN } = await load()
    for (const c of chains)
      expect(c.nativePriceToken).toBe(
        (NATIVE_PRICE_TOKEN as Record<number, Address | null>)[c.id]
      )
  })

  it('uses the canonical multicall3 on hyperevm, megaeth and monad', async () => {
    const { chains } = await load()
    for (const slug of ['hyperevm', 'megaeth', 'monad']) {
      expect(chains.find((c) => c.slug === slug)?.multicall3).toBe(MULTICALL3)
    }
  })

  it('reads every chain through the server key', async () => {
    const { chains } = await load()
    for (const c of chains) {
      const t = (c.client as unknown as { transport: unknown }).transport as {
        url: string
      }
      expect(t.url).toContain('server-key')
      expect(t.url).not.toContain('browser-key')
    }
  })

  it('adds the current auth header to every request, keeping its own', async () => {
    await load()
    const { freshHeadersFetch } = await import('./holdings-chains')
    const spy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response('{}')
    )
    await freshHeadersFetch('linea', spy as unknown as typeof fetch)(
      'https://rpc.example',
      { method: 'POST', headers: { 'Content-Type': 'application/json' } }
    )
    const headers = new Headers(spy.mock.calls[0][1]?.headers)
    expect(headers.get('Authorization')).toBe(
      `Basic ${Buffer.from(':server-secret').toString('base64')}`
    )
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(spy.mock.calls[0][1]?.method).toBe('POST')
  })

  it('reads the auth header again on every request', async () => {
    await load()
    const { freshHeadersFetch } = await import('./holdings-chains')
    const spy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response('{}')
    )
    const send = freshHeadersFetch('linea', spy as unknown as typeof fetch)
    await send('https://rpc.example', { method: 'POST', body: 'a' })
    vi.stubEnv('RPC_API_KEY_SECRET', 'rotated-secret')
    await send('https://rpc.example', { method: 'POST', body: 'b' })
    const auth = (i: number) =>
      new Headers(spy.mock.calls[i][1]?.headers).get('Authorization')
    expect(auth(0)).toBe(
      `Basic ${Buffer.from(':server-secret').toString('base64')}`
    )
    expect(auth(1)).toBe(
      `Basic ${Buffer.from(':rotated-secret').toString('base64')}`
    )
    expect(spy.mock.calls[1][1]?.body).toBe('b')
  })

  it('uses a plain http transport on every chain, no fallback', async () => {
    const { chains } = await load()
    for (const c of chains)
      expect(
        (c.client as unknown as { transport: { type: string } }).transport.type
      ).toBe('http')
  })

  it('fails only the unserved chain, not all of them', async () => {
    vi.stubEnv('NEXT_PUBLIC_RPC_PROVIDER', 'infura')
    vi.stubEnv('NEXT_PUBLIC_RPC_API_KEY', 'browser-key')
    vi.stubEnv('RPC_API_KEY', 'server-key')
    vi.doMock('@/config/rpc.server', () => ({
      serverRpc: (slug: string) =>
        slug === 'monad'
          ? null
          : { url: `https://x.example/${slug}`, headers: {} },
    }))
    vi.resetModules()
    const { holdingsChains } = await import('./holdings-chains')
    const chains = holdingsChains()
    expect(chains).toHaveLength(16)
    const monad = chains.find((c) => c.slug === 'monad')
    await expect(monad?.client.getBalance({ address: '0x0' })).rejects.toThrow(
      'no server RPC for monad'
    )
  })
})

describe('unavailableClient', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('rejects every method with the reason', async () => {
    vi.stubEnv('NEXT_PUBLIC_RPC_PROVIDER', 'infura')
    vi.stubEnv('NEXT_PUBLIC_RPC_API_KEY', 'browser-key')
    vi.resetModules()
    const { unavailableClient } = await import('./holdings-chains')
    const client = unavailableClient('no server RPC for monad')
    await expect(client.getBalance({} as never)).rejects.toThrow(
      'no server RPC for monad'
    )
    await expect(client.multicall({} as never)).rejects.toThrow(
      'no server RPC for monad'
    )
    await expect(client.readContract({} as never)).rejects.toThrow(
      'no server RPC for monad'
    )
  })
})
