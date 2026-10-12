import { AlertTriangle } from 'lucide-react'

import type { PortfolioPartialFailure } from '@/lib/portfolio/types'
import { failureLabel } from '@/lib/portfolio/view'

export function PartialDataBanner({
  failures,
}: {
  failures: PortfolioPartialFailure[]
}) {
  if (failures.length === 0) return null
  const labels = [...new Set(failures.map(failureLabel))].join(', ')
  return (
    <div
      role="status"
      className="border-border flex items-start gap-2 border-b bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        Partial data: {labels} temporarily unavailable. Everything else below is
        up to date.
      </span>
    </div>
  )
}
