import type { Address } from 'viem'

import type { EvmWalletHoldings } from '@/lib/portfolio/types'

/** How long a complete read of a wallet set is served from memory. */
export const EVM_HOLDINGS_TTL_MS = 30_000

/** Wallet sets kept at once; the oldest entry goes first. */
const MAX_ENTRIES = 500

/**
 * A wallet-balance read shared by identical calls. A page open triggers
 * several portfolio loads in a few seconds, each about 16 `eth_call`s: the
 * burst trips the provider's per-second rate limit (HTTP 429). Concurrent
 * calls for the same wallet set share one read, and a complete read is served
 * from memory for `ttlMs`. A read with failed networks, or a rejection, is not
 * kept, so the next load tries again. Balances are public: the cache holds
 * nothing user-private.
 */
export function cachedEvmHoldings(
  read: (owners: Address[]) => Promise<EvmWalletHoldings>,
  opts: { ttlMs?: number; maxEntries?: number; now?: () => number } = {}
): (owners: Address[]) => Promise<EvmWalletHoldings> {
  const ttlMs = opts.ttlMs ?? EVM_HOLDINGS_TTL_MS
  const maxEntries = opts.maxEntries ?? MAX_ENTRIES
  const now = opts.now ?? Date.now
  const done = new Map<string, { at: number; value: EvmWalletHoldings }>()
  const pending = new Map<string, Promise<EvmWalletHoldings>>()

  return (owners) => {
    const key = owners
      .map((o) => o.toLowerCase())
      .sort()
      .join(',')
    const hit = done.get(key)
    if (hit && now() - hit.at < ttlMs) return Promise.resolve(hit.value)
    done.delete(key)

    const inFlight = pending.get(key)
    if (inFlight) return inFlight

    const p = read(owners)
      .then((value) => {
        if (value.failedNetworks.length === 0) {
          done.set(key, { at: now(), value })
          if (done.size > maxEntries) {
            done.delete(done.keys().next().value as string)
          }
        }
        return value
      })
      .finally(() => pending.delete(key))
    pending.set(key, p)
    return p
  }
}
