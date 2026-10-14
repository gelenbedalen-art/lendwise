/**
 * A promise queue that spaces the START of each call by a minimum interval.
 *
 * Pacing, not retrying, keeps a client under a rate limit: a 429 has already
 * spent the request (see the measurements on `RPC_MIN_INTERVAL_MS` in
 * blend/common/api.ts, where this pattern was first proven on Soroban RPC).
 * One queue per upstream, at module level, so concurrent callers in the same
 * instance share it.
 */
export interface PacedQueue {
  run<T>(fn: () => Promise<T>): Promise<T>
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

export function createPacedQueue({
  minIntervalMs,
  now = Date.now,
  sleep = defaultSleep,
}: {
  minIntervalMs: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}): PacedQueue {
  let tail: Promise<unknown> = Promise.resolve()
  let lastStartAt = Number.NEGATIVE_INFINITY

  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      const task = async (): Promise<T> => {
        const wait = lastStartAt + minIntervalMs - now()
        if (wait > 0) await sleep(wait)
        lastStartAt = now()
        return fn()
      }
      // Chained on both settle paths so one rejection cannot stall the queue.
      const result = tail.then(task, task)
      tail = result.then(
        () => undefined,
        () => undefined
      )
      return result
    },
  }
}
