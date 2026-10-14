import { describe, expect, it } from 'vitest'

import { createPacedQueue } from './paced-queue'

/** A clock that only moves when the queue sleeps. */
function fakeClock() {
  let t = 1_000
  const sleeps: number[] = []
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms)
      t += ms
    },
    advance: (ms: number) => {
      t += ms
    },
    sleeps,
  }
}

describe('createPacedQueue', () => {
  it('runs the first call at once', async () => {
    const clock = fakeClock()
    const q = createPacedQueue({ minIntervalMs: 250, ...clock })
    expect(await q.run(async () => 'a')).toBe('a')
    expect(clock.sleeps).toEqual([])
  })

  it('spaces call starts by the minimum interval', async () => {
    const clock = fakeClock()
    const q = createPacedQueue({ minIntervalMs: 250, ...clock })
    const starts: number[] = []
    await Promise.all(
      [1, 2, 3].map((i) =>
        q.run(async () => {
          starts.push(clock.now())
          return i
        })
      )
    )
    expect(starts[1] - starts[0]).toBe(250)
    expect(starts[2] - starts[1]).toBe(250)
  })

  it('does not wait when the interval has already passed', async () => {
    const clock = fakeClock()
    const q = createPacedQueue({ minIntervalMs: 250, ...clock })
    await q.run(async () => 1)
    clock.advance(1_000)
    await q.run(async () => 2)
    expect(clock.sleeps).toEqual([])
  })

  it('keeps going after a rejection', async () => {
    const clock = fakeClock()
    const q = createPacedQueue({ minIntervalMs: 250, ...clock })
    const failed = q.run(async () => {
      throw new Error('boom')
    })
    const next = q.run(async () => 'next')
    await expect(failed).rejects.toThrow('boom')
    await expect(next).resolves.toBe('next')
  })

  it('keeps calls in submission order', async () => {
    const clock = fakeClock()
    const q = createPacedQueue({ minIntervalMs: 10, ...clock })
    const order: number[] = []
    await Promise.all(
      [1, 2, 3, 4].map((i) => q.run(async () => void order.push(i)))
    )
    expect(order).toEqual([1, 2, 3, 4])
  })
})
