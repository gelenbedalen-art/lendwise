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

/** True when this wallet holds the signed-in SEP-10 session. */
export function ownsStellarSession(
  wallet: Pick<Wallet, 'address' | 'stellarSession'> | undefined
): boolean {
  return !!wallet && wallet.stellarSession?.address === wallet.address
}

/** Whether an active wallet may be shown as the header wallet. */
export function isDisplayableActive(
  wallet: Pick<Wallet, 'chainFamily' | 'isConnected' | 'isActive'>
): boolean {
  return wallet.chainFamily !== 'stellar' || wallet.isConnected
}
