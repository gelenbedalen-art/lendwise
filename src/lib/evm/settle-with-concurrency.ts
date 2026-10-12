/**
 * `Promise.allSettled(items.map(fn))` with at most `limit` calls in flight.
 * Results keep the order of `items`; a rejection is captured, not thrown.
 */
export async function settleWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      try {
        results[i] = { status: 'fulfilled', value: await fn(items[i]) }
      } catch (reason) {
        results[i] = { status: 'rejected', reason }
      }
    }
  }
  const workers = Math.min(Math.max(1, Math.floor(limit)), items.length)
  await Promise.all(Array.from({ length: workers }, worker))
  return results
}
