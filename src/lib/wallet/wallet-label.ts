/**
 * The line under a wallet in the wallet list: its family, and whether it can
 * sign right now (an EVM wallet needs a wagmi client, a Stellar wallet a
 * session).
 */
export function walletSubtitle(
  wallet: { chainFamily: string; isConnected: boolean },
  hasClient: boolean
): string | null {
  if (wallet.chainFamily === 'stellar') {
    return wallet.isConnected ? 'Stellar' : 'Stellar · Not signed in'
  }
  if (wallet.chainFamily === 'evm') {
    return hasClient ? 'EVM' : 'EVM · Not connected'
  }
  return null
}
