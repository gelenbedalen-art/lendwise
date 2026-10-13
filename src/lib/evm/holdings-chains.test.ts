import type { Address } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11'

// chains.ts reads the Infura key at import: stub it before the dynamic import.
async function load() {
  vi.stubEnv('NEXT_PUBLIC_INFURA_API_KEY', 'test-key')
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
})
