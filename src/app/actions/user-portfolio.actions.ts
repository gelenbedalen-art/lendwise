'use server'

import {
  APP_ADAPTERS,
  stellarPositionAdapters,
} from '@/config/protocols-server'
import { loadPortfolio } from '@/lib/portfolio/load'
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
  return loadPortfolio(Array.isArray(wallets) ? wallets : [], {
    evmAdapters,
    stellarAdapters: stellarPositionAdapters(),
    stellarHoldings: (addresses) => getStellarWalletHoldings(addresses),
    computeRisk: (accounts) => computeRiskAccounts(accounts),
  })
}
