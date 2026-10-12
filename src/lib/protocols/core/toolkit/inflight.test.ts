import { describe, expect, it, vi } from 'vitest'

import { dedupeInFlight } from './inflight'

describe('dedupeInFlight', () => {
  it('shares one pending call per key and forgets it once settled', async () => {
    const fn = vi.fn(async (x: number) => x * 2)
    const once = dedupeInFlight((x: number) => String(x), fn)
    const [a, b] = await Promise.all([once(2), once(2)])
    expect([a, b]).toEqual([4, 4])
    expect(fn).toHaveBeenCalledTimes(1)
    await once(2)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('propagates a rejection to every waiter and clears the key', async () => {
    const fn = vi.fn(async () => {
      throw new Error('boom')
    })
    const once = dedupeInFlight(() => 'k', fn)
    await expect(Promise.all([once(), once()])).rejects.toThrow('boom')
    await expect(once()).rejects.toThrow('boom')
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
