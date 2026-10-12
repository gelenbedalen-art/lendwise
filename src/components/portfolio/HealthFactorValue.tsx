import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { HealthSummary } from '@/lib/risk/summary'
import type { HealthFactorResult } from '@/lib/risk/types'
import { cn } from '@/lib/utils'

const zone = (hf: number) =>
  hf < 1 ? 'text-rose-400' : hf < 1.5 ? 'text-amber-400' : 'text-emerald-400'

const REASON: Record<string, string> = {
  'missing-price': 'No current price for',
  'invalid-weight': 'No usable risk weight for',
  'invalid-amount': 'Invalid amount for',
}

export function HealthFactorValue({ result }: { result: HealthFactorResult }) {
  if (result.status === 'no-liability') {
    return <span className="font-mono text-emerald-400">∞</span>
  }
  if (result.status === 'unknown') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="rounded bg-rose-500/15 px-1.5 py-0.5 font-mono text-xs text-rose-300">
            Unknown
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {result.symbols.length === 0
            ? 'Risk data unavailable — the health factor is not computed rather than guessed.'
            : `${REASON[result.reason]} ${result.symbols.join(', ')} — the health factor is not computed rather than guessed.`}
        </TooltipContent>
      </Tooltip>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('font-mono', zone(result.healthFactor))}>
          {result.healthFactor.toFixed(2)}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        Weighted collateral ${result.weightedCollateralUsd.toFixed(2)} ÷
        weighted debt ${result.weightedLiabilityUsd.toFixed(2)}
      </TooltipContent>
    </Tooltip>
  )
}

export function HealthSummaryValue({ summary }: { summary: HealthSummary }) {
  switch (summary.status) {
    case 'none':
      return <span className="text-muted-foreground font-mono">—</span>
    case 'no-liability':
      return <span className="font-mono text-emerald-400">∞</span>
    case 'ok':
      return (
        <span className={cn('font-mono', zone(summary.lowest))}>
          {summary.lowest.toFixed(2)}
        </span>
      )
    case 'unknown':
      return (
        <span className="font-mono text-rose-300">
          Unknown ({summary.unknownCount} account
          {summary.unknownCount > 1 ? 's' : ''})
        </span>
      )
  }
}
