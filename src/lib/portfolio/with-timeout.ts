/**
 * Rejects when `promise` has not settled in `ms`. The timer is cleared once
 * the race settles, so nothing keeps the process alive.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`timed out after ${ms}ms`)),
      Math.max(0, ms)
    )
  })
  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer))
}
