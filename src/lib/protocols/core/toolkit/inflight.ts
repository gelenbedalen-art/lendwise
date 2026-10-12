/**
 * Calls made while an identical call (same key) is pending share its promise.
 * The portfolio reads supply, borrow and risk accounts of an adapter
 * concurrently; this makes them one upstream read instead of three.
 * Nothing is cached once the call settles.
 */
export function dedupeInFlight<A extends unknown[], R>(
  key: (...args: A) => string,
  fn: (...args: A) => Promise<R>
): (...args: A) => Promise<R> {
  const pending = new Map<string, Promise<R>>()
  return (...args: A) => {
    const k = key(...args)
    const hit = pending.get(k)
    if (hit) return hit
    const p = fn(...args).finally(() => pending.delete(k))
    pending.set(k, p)
    return p
  }
}
