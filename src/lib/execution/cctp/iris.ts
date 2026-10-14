import { type PacedQueue, createPacedQueue } from '@/lib/net/paced-queue'

export type IrisMessageState =
  | {
      status: 'pending'
      reason: 'not-found' | 'pending-confirmations' | 'rate-limited'
    }
  | {
      status: 'complete'
      message: `0x${string}`
      attestation: `0x${string}`
      eventNonce: string
    }

export interface IrisClient {
  getMessage(
    sourceDomain: number,
    txHash: `0x${string}`
  ): Promise<IrisMessageState>
}

/**
 * One queue per process for every Iris call (messages and fee quotes): Circle
 * blocks the caller for 5 minutes past 35 requests/s, and this process may
 * serve several pollers at once. Same primitive as Blend's `pacedRpc`.
 */
export const irisQueue: PacedQueue = createPacedQueue({ minIntervalMs: 250 })

const TX_HASH = /^0x[0-9a-fA-F]{64}$/
const HEX = /^0x([0-9a-fA-F]{2})+$/

interface IrisApiMessage {
  status?: string
  message?: string
  attestation?: string
  eventNonce?: string
}

export function createIrisClient(deps: {
  baseUrl: string
  fetchFn?: typeof fetch
  queue?: PacedQueue
}): IrisClient {
  const fetchFn = deps.fetchFn ?? fetch
  const queue = deps.queue ?? irisQueue
  return {
    async getMessage(sourceDomain, txHash) {
      if (!TX_HASH.test(txHash))
        throw new Error('Invalid burn transaction hash')
      const url = `${deps.baseUrl}/v2/messages/${sourceDomain}?transactionHash=${txHash}`
      const res = await queue.run(() =>
        fetchFn(url, {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(10_000),
        })
      )
      if (res.status === 404) return { status: 'pending', reason: 'not-found' }
      if (res.status === 429)
        return { status: 'pending', reason: 'rate-limited' }
      if (!res.ok) throw new Error(`Iris ${res.status}`)

      const body = (await res.json()) as { messages?: IrisApiMessage[] }
      // A burn transaction carries one message; the plan check (message.ts)
      // rejects anything that is not the transfer we planned.
      const msg = body.messages?.[0]
      if (!msg) return { status: 'pending', reason: 'not-found' }
      if (
        msg.status !== 'complete' ||
        !msg.attestation ||
        !HEX.test(msg.attestation) ||
        !msg.message ||
        !HEX.test(msg.message)
      ) {
        return { status: 'pending', reason: 'pending-confirmations' }
      }
      return {
        status: 'complete',
        message: msg.message as `0x${string}`,
        attestation: msg.attestation as `0x${string}`,
        eventNonce: msg.eventNonce ?? '',
      }
    },
  }
}
