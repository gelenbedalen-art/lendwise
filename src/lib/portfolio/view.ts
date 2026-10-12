import { protocolVersionName } from '@/config/protocols-meta'
import type { HealthFactorResult, RiskAccountResult } from '@/lib/risk/types'
import type { BorrowPosition } from '@/types'

import { type PortfolioPartialFailure, STELLAR_WALLET_SOURCE } from './types'

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
