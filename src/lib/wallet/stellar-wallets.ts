import type { StellarSession, Wallet } from '@/stores/walletStore'

/**
 * Partial store update applied to a persisted Stellar wallet on restore.
 * Only the wallet owning the server SEP-10 session stays connected; every
 * other one is kept but shown as signed out and never active.
 */
export function restoredStellarWalletUpdate(
  wallet: Pick<Wallet, 'address' | 'isActive'>,
  session: StellarSession | null | undefined
): Partial<Wallet> {
  if (session && session.address === wallet.address) {
    return {
      isConnected: true,
      isCurrentlyConnected: wallet.isActive,
      stellarSession: session,
    }
  }
  return {
    isConnected: false,
    isCurrentlyConnected: false,
    isActive: false,
    stellarSession: undefined,
  }
}

/**
 * Fail closed: skip clearing the server session only when it is known to
 * belong to a different address.
 */
export function shouldClearStellarSession(
  address: string,
  server: { ok: true; sessionAddress: string | null } | { ok: false }
): boolean {
  if (!server.ok || server.sessionAddress === null) return true
  return server.sessionAddress === address
}

/** Whether an active wallet may be shown as the header wallet. */
export function isDisplayableActive(
  wallet: Pick<Wallet, 'address' | 'chainFamily' | 'stellarSession'>
): boolean {
  return (
    wallet.chainFamily !== 'stellar' ||
    wallet.stellarSession?.address === wallet.address
  )
}
