import type { RiskAccountResult } from './types'

export type HealthSummary =
  | { status: 'none' }
  | { status: 'no-liability' }
  | { status: 'ok'; lowest: number }
  | { status: 'unknown'; unknownCount: number; lowest: number | null }

/**
 * The portfolio-level figure: the LOWEST health factor across isolated
 * accounts — never a sum of them. `reported` carries protocol-reported values
 * (Aave, Compound) for rows the module does not compute.
 */
export function summarizeHealth(
  results: RiskAccountResult[],
  reported: number[] = []
): HealthSummary {
  const fromReported = reported.filter((v) => Number.isFinite(v) && v > 0)
  if (results.length === 0 && fromReported.length === 0)
    return { status: 'none' }

  const numeric = [
    ...results.flatMap((r) =>
      r.result.status === 'ok' ? [r.result.healthFactor] : []
    ),
    ...fromReported,
  ]
  const lowest = numeric.length > 0 ? Math.min(...numeric) : null
  const unknownCount = results.filter(
    (r) => r.result.status === 'unknown'
  ).length

  if (unknownCount > 0) return { status: 'unknown', unknownCount, lowest }
  if (lowest == null) return { status: 'no-liability' }
  return { status: 'ok', lowest }
}
