import type { BridgeTransferStatus } from '@/lib/db/repositories/bridge-transfers'
import type { BridgeTransferView } from '@/lib/execution/cctp/view'

/** `listBridgeTransfers` returns at most this many transfers (the repository's default limit). */
export const HISTORY_LIMIT = 20

/** The status of a transfer in one or two words, for the history rows. */
export const STATUS_SHORT: Record<BridgeTransferStatus, string> = {
  planned: 'Not started',
  burn_submitted: 'Burn sent',
  burn_confirmed: 'Waiting for Circle',
  attested: 'Ready to mint',
  mint_submitted: 'Mint sent',
  completed: 'Done',
  failed: 'Stopped',
}

const newestFirst = (a: BridgeTransferView, b: BridgeTransferView) =>
  Date.parse(b.createdAt) - Date.parse(a.createdAt)

/** Resumable transfers first, then the others; newest first in each. A new array. */
export function orderTransfers(
  transfers: readonly BridgeTransferView[]
): BridgeTransferView[] {
  return [
    ...transfers.filter((t) => t.resumable).sort(newestFirst),
    ...transfers.filter((t) => !t.resumable).sort(newestFirst),
  ]
}

/** The dot on the history button: a resumable transfer other than the one on screen. */
export function hasOtherResumable(
  transfers: readonly BridgeTransferView[],
  currentId: string | null
): boolean {
  return transfers.some((t) => t.resumable && t.id !== currentId)
}

/** The server returned as many transfers as it can: older ones are not listed. */
export function isHistoryTruncated(
  transfers: readonly BridgeTransferView[]
): boolean {
  return transfers.length >= HISTORY_LIMIT
}
