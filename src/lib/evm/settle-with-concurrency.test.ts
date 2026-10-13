import { describe, expect, it } from 'vitest'

import { settleWithConcurrency } from './settle-with-concurrency'

function deferred<T = void>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('settleWithConcurrency', () => {
  it('never runs more than `limit` calls at once', async () => {
    const gates = [1, 2, 3, 4, 5].map(() => deferred())
    let inFlight = 0
    let peak = 0
    const run = settleWithConcurrency([0, 1, 2, 3, 4], 2, async (i) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await gates[i].promise
      inFlight--
      return i
    })
    await tick()
    expect(inFlight).toBe(2)
    for (const g of gates) {
      g.resolve()
      await tick()
    }
    await run
    expect(peak).toBe(2)
  })

  it('returns results in input order', async () => {
    const gates = [deferred(), deferred(), deferred()]
    const run = settleWithConcurrency([0, 1, 2], 3, async (i) => {
      await gates[i].promise
      return `r${i}`
    })
    gates[2].resolve()
    gates[0].resolve()
    gates[1].resolve()
    expect(await run).toEqual([
      { status: 'fulfilled', value: 'r0' },
      { status: 'fulfilled', value: 'r1' },
      { status: 'fulfilled', value: 'r2' },
    ])
  })

  it('captures a rejection and still runs the other items', async () => {
    const boom = new Error('boom')
    const r = await settleWithConcurrency([0, 1, 2], 1, async (i) => {
      if (i === 1) throw boom
      return i
    })
    expect(r).toEqual([
      { status: 'fulfilled', value: 0 },
      { status: 'rejected', reason: boom },
      { status: 'fulfilled', value: 2 },
    ])
  })

  it('captures a synchronous throw and still runs the other items', async () => {
    const boom = new Error('boom')
    const r = await settleWithConcurrency([0, 1, 2], 2, ((i: number) => {
      if (i === 1) throw boom
      return Promise.resolve(i)
    }) as (i: number) => Promise<number>)
    expect(r).toEqual([
      { status: 'fulfilled', value: 0 },
      { status: 'rejected', reason: boom },
      { status: 'fulfilled', value: 2 },
    ])
  })

  it.each([NaN, 0, -3, Infinity])(
    'processes every item with limit %s',
    async (limit) => {
      const r = await settleWithConcurrency([1, 2, 3], limit, async (n) => n)
      expect(r).toEqual([
        { status: 'fulfilled', value: 1 },
        { status: 'fulfilled', value: 2 },
        { status: 'fulfilled', value: 3 },
      ])
    }
  )

  it('floors a fractional limit', async () => {
    let inFlight = 0
    let peak = 0
    await settleWithConcurrency([1, 2, 3, 4], 2.9, async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await tick()
      inFlight--
    })
    expect(peak).toBe(2)
  })

  it('returns [] for empty input', async () => {
    expect(await settleWithConcurrency([], 4, async () => 1)).toEqual([])
  })

  it('handles a limit larger than the input', async () => {
    const r = await settleWithConcurrency([1, 2], 10, async (n) => n * 2)
    expect(r).toEqual([
      { status: 'fulfilled', value: 2 },
      { status: 'fulfilled', value: 4 },
    ])
  })
})
