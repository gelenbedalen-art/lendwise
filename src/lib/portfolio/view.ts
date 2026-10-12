import { protocolVersionName } from '@/config/protocols-meta'
import type { HealthFactorResult, RiskAccountResult } from '@/lib/risk/types'
import type { BorrowPosition } from '@/types'

import {
  type PortfolioPartialFailure,
  STELLAR_WALLET_SOURCE,
  type StellarHolding,
} from './types'

export type BorrowRow = BorrowPosition & { risk?: HealthFactorResult }

const RISK_UNAVAILABLE: HealthFactorResult = {
  status: 'unknown',
  reason: 'missing-price',
  symbols: [],
}

/**
 * Rows backed by a risk account take the module result. When that result is
 * missing (risk read or computation failed) the row is `unknown` — the
 * placeholder `healthFactor` of such rows is never displayed.
 */
export function attachRisk(
  rows: BorrowPosition[],
  results: RiskAccountResult[]
): BorrowRow[] {
  const byId = new Map(results.map((r) => [r.id, r.result] as const))
  return rows.map((row) => {
    if (!row.riskAccountId) return row
    return { ...row, risk: byId.get(row.riskAccountId) ?? RISK_UNAVAILABLE }
  })
}

/** Distinct risk accounts that rows point at but no result backs. */
export function orphanRiskRows(
  rows: BorrowRow[],
  results: RiskAccountResult[]
): number {
  const known = new Set(results.map((r) => r.id))
  return new Set(
    rows.flatMap((r) =>
      r.riskAccountId && !known.has(r.riskAccountId) ? [r.riskAccountId] : []
    )
  ).size
}

/** Health factors protocols report on rows the module does not compute (Aave, Compound). */
export function reportedHealthFactors(rows: BorrowRow[]): number[] {
  return rows.filter((r) => !r.riskAccountId).map((r) => Number(r.healthFactor))
}

export function sortableHealth(row: BorrowRow): number {
  if (!row.risk) return Number(row.healthFactor)
  if (row.risk.status === 'ok') return row.risk.healthFactor
  if (row.risk.status === 'no-liability') return Number.POSITIVE_INFINITY
  return -1
}

export function failureLabel(f: PortfolioPartialFailure): string {
  const family = f.chainFamily === 'evm' ? 'EVM' : 'Stellar'
  if (f.source === STELLAR_WALLET_SOURCE) return 'Stellar wallet'
  if (f.source === f.chainFamily) return family
  return `${family} · ${protocolVersionName(f.source)}`
}

export interface WalletBalanceRow {
  id: string
  network: string
  userAddress: string
  assetCode: string
  issuer: string | null
  balance: number
  valueUsd: number | null
}

/** Wallet holdings as table rows: highest value first, unpriced last, then by code. */
export function walletBalanceRows(
  holdings: StellarHolding[]
): WalletBalanceRow[] {
  return holdings
    .map((h) => ({
      id: `${h.owner}:${h.code}:${h.issuer ?? 'native'}`,
      network: 'stellar',
      userAddress: h.owner,
      assetCode: h.code,
      issuer: h.issuer,
      balance: h.balance,
      valueUsd: h.valueUsd,
    }))
    .sort((a, b) => {
      if (a.valueUsd !== b.valueUsd) {
        if (a.valueUsd === null) return 1
        if (b.valueUsd === null) return -1
        return b.valueUsd - a.valueUsd
      }
      return a.assetCode.localeCompare(b.assetCode)
    })
}

export interface WalletNetworkSlice {
  network: string
  valueUsd: number
  /** Percentage (0-100) of the total priced value. */
  share: number
}

/** Wallet rows grouped by network: priced value per network, largest first. */
export function walletBalanceBreakdown(rows: WalletBalanceRow[]): {
  totalUsd: number | null
  priced: number
  unpriced: number
  slices: WalletNetworkSlice[]
} {
  const byNetwork = new Map<string, number>()
  let priced = 0
  for (const row of rows) {
    if (row.valueUsd === null) continue
    priced += 1
    byNetwork.set(row.network, (byNetwork.get(row.network) ?? 0) + row.valueUsd)
  }
  const totalUsd =
    priced > 0 ? [...byNetwork.values()].reduce((a, v) => a + v, 0) : null
  const slices = [...byNetwork.entries()]
    .map(([network, valueUsd]) => ({
      network,
      valueUsd,
      share: totalUsd && totalUsd > 0 ? (valueUsd / totalUsd) * 100 : 0,
    }))
    .sort((a, b) => b.valueUsd - a.valueUsd)
  return { totalUsd, priced, unpriced: rows.length - priced, slices }
}
