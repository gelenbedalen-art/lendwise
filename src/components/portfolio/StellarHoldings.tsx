import type { StellarHolding } from '@/lib/portfolio/types'
import { formatAddress } from '@/lib/utils'

export function StellarHoldings({ holdings }: { holdings: StellarHolding[] }) {
  if (holdings.length === 0) return null
  return (
    <section className="border-border border-b px-4 py-3 md:px-8">
      <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wider uppercase">
        Stellar wallet
      </p>
      <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {holdings.map((h) => (
          <li
            key={`${h.owner}:${h.code}:${h.issuer ?? 'native'}`}
            className="font-mono"
          >
            {h.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}{' '}
            {h.code}
            {h.issuer ? (
              <span className="text-muted-foreground">
                {' '}
                · {formatAddress(h.issuer)}
              </span>
            ) : null}
            <span className="text-muted-foreground">
              {' '}
              ({h.valueUsd == null ? '—' : `$${h.valueUsd.toFixed(2)}`})
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
