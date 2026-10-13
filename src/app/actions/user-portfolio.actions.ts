'use server'

import {
  APP_ADAPTERS,
  stellarPositionAdapters,
} from '@/config/protocols-server'
import {
  loadCatalogTokens,
  loadHoldingPrices,
} from '@/lib/evm/holdings-catalog'
import { holdingsChains } from '@/lib/evm/holdings-chains'
import { getEvmWalletHoldings } from '@/lib/evm/wallet-holdings'
import { loadPortfolio } from '@/lib/portfolio/load'
import { sanitizeWalletInputs } from '@/lib/portfolio/routing'
import type {
  PortfolioWalletInput,
  UserPortfolioResult,
} from '@/lib/portfolio/types'
import type { AppAdapter } from '@/lib/protocols/core/types'
import { computeRiskAccounts } from '@/lib/risk/compute'
import { getStellarWalletHoldings } from '@/lib/stellar/wallet-holdings'

const evmAdapters: Record<string, () => Promise<AppAdapter>> =
  Object.fromEntries(
    Object.entries(APP_ADAPTERS).filter(
      (e): e is [string, () => Promise<AppAdapter>] => e[1] != null
    )
  )

export async function loadUserPortfolio(
  wallets: PortfolioWalletInput[]
): Promise<UserPortfolioResult> {
  return loadPortfolio(sanitizeWalletInputs(wallets), {
    evmAdapters,
    stellarAdapters: stellarPositionAdapters(),
    stellarHoldings: (addresses) => getStellarWalletHoldings(addresses),
    evmHoldings: (addresses) =>
      getEvmWalletHoldings(addresses, {
        chains: holdingsChains(),
        tokens: loadCatalogTokens,
        prices: loadHoldingPrices,
      }),
    computeRisk: (accounts) => computeRiskAccounts(accounts),
  })
}
