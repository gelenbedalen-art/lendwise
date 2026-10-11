import { StrKey } from '@stellar/stellar-sdk'
import { type Address, isAddress } from 'viem'

import { MAX_PORTFOLIO_WALLETS, type PortfolioWalletInput } from './types'

export interface RoutedPortfolioWallets {
  evmAddresses: Address[]
  stellarAddresses: string[]
}

/**
 * Splits wallets by chain family. A `G…` address only ever reaches Stellar
 * adapters and a `0x…` one EVM adapters; anything malformed is dropped.
 */
export function routePortfolioWallets(
  wallets: PortfolioWalletInput[]
): RoutedPortfolioWallets {
  const evm = new Map<string, Address>()
  const stellar = new Set<string>()

  for (const w of wallets.slice(0, MAX_PORTFOLIO_WALLETS)) {
    if (w.chainFamily === 'evm' && isAddress(w.address, { strict: false })) {
      evm.set(w.address.toLowerCase(), w.address)
    } else if (
      w.chainFamily === 'stellar' &&
      StrKey.isValidEd25519PublicKey(w.address)
    ) {
      stellar.add(w.address)
    }
  }

  return { evmAddresses: [...evm.values()], stellarAddresses: [...stellar] }
}
