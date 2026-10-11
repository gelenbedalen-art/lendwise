import type { RiskAccountResult } from '@/lib/risk/types'
import type { UserPosition } from '@/types'

export type PortfolioChainFamily = 'evm' | 'stellar'

/** Bounds the RPC work one call of the public server action can trigger. */
export const MAX_PORTFOLIO_WALLETS = 10

/** Failure `source` of the Horizon wallet-holdings read. */
export const STELLAR_WALLET_SOURCE = 'stellar_wallet'

export interface PortfolioWalletInput {
  address: string
  chainFamily: PortfolioChainFamily
}

/** One source that could not be read; every other source is still shown. */
export interface PortfolioPartialFailure {
  chainFamily: PortfolioChainFamily
  /** Adapter id, STELLAR_WALLET_SOURCE, or the family itself. */
  source: string
  message: string
}

/** A balance of the Stellar wallet itself — not a lending position. */
export interface StellarHolding {
  owner: string
  assetType: 'native' | 'credit'
  code: string
  issuer: string | null
  balance: number
  priceUsd: number | null
  valueUsd: number | null
}

export interface UserPortfolioResult {
  positions: UserPosition
  holdings: StellarHolding[]
  riskAccounts: RiskAccountResult[]
  failures: PortfolioPartialFailure[]
}

export function emptyUserPositions(): UserPosition {
  return { supply: {}, borrow: {} }
}

export function emptyPortfolio(): UserPortfolioResult {
  return {
    positions: emptyUserPositions(),
    holdings: [],
    riskAccounts: [],
    failures: [],
  }
}

export function mergeUserPositions(...positions: UserPosition[]): UserPosition {
  const merged = emptyUserPositions()
  for (const p of positions) {
    for (const [protocol, rows] of Object.entries(p.supply)) {
      merged.supply[protocol] = [...(merged.supply[protocol] ?? []), ...rows]
    }
    for (const [protocol, rows] of Object.entries(p.borrow)) {
      merged.borrow[protocol] = [...(merged.borrow[protocol] ?? []), ...rows]
    }
  }
  return merged
}
