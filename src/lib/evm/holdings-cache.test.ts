import type { Address } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import type { EvmWalletHoldings } from '@/lib/portfolio/types'

import { cachedEvmHoldings } from './holdings-cache'

const A = '0x00000000000000000000000000000000000000A1' as Address
const B = '0x00000000000000000000000000000000000000b2' as Address

const ok: EvmWalletHoldings = { holdings: [], failedNetworks: [] }
const partial: EvmWalletHoldings = { holdings: [], failedNetworks: ['celo'] }

function clock(start = 0) {
  let t = start
  return { now: () => t, advance: (ms: number) => (t += ms) }
}

describe('cachedEvmHoldings', () => {
  it('shares one read between identical concurrent calls', async () => {
    let release: (v: EvmWalletHoldings) => void = () => {}
    const read = vi.fn(
      () => new Promise<EvmWalletHoldings>((r) => (release = r))
    )
    const cached = cachedEvmHoldings(read)
    const first = cached([A, B])
    const second = cached([B.toUpperCase() as Address, A])
    release(ok)
    expect(await first).toBe(ok)
    expect(await second).toBe(ok)
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('serves a complete read from cache until it expires', async () => {
    const c = clock()
    const read = vi.fn(async () => ok)
    const cached = cachedEvmHoldings(read, { ttlMs: 1_000, now: c.now })
    await cached([A])
    c.advance(999)
    await cached([A])
    expect(read).toHaveBeenCalledTimes(1)
    c.advance(1)
    await cached([A])
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('does not cache a read with failed networks', async () => {
    const read = vi.fn(async () => partial)
    const cached = cachedEvmHoldings(read)
    await cached([A])
    await cached([A])
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('does not cache a rejection, and the next call reads again', async () => {
    const read = vi
      .fn<(owners: Address[]) => Promise<EvmWalletHoldings>>()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce(ok)
    const cached = cachedEvmHoldings(read)
    await expect(cached([A])).rejects.toThrow('db down')
    expect(await cached([A])).toBe(ok)
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('keeps different wallet sets apart', async () => {
    const read = vi.fn(async () => ok)
    const cached = cachedEvmHoldings(read)
    await cached([A])
    await cached([A, B])
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('stays bounded', async () => {
    const read = vi.fn(async () => ok)
    const cached = cachedEvmHoldings(read, { maxEntries: 2 })
    const w = (n: number) =>
      [`0x${n.toString(16).padStart(40, '0')}`] as Address[]
    await cached(w(1))
    await cached(w(2))
    await cached(w(3))
    await cached(w(1))
    expect(read).toHaveBeenCalledTimes(4)
  })
})
