'use client'

import { useCallback, useRef, useState, useTransition } from 'react'

import { loadUserPortfolio } from '@/app/actions'
import {
  type PortfolioWalletInput,
  type UserPortfolioResult,
  emptyPortfolio,
} from '@/lib/portfolio/types'

export function useLoadUserPortfolio(wallets: PortfolioWalletInput[]) {
  const [portfolio, setPortfolio] =
    useState<UserPortfolioResult>(emptyPortfolio)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Only the latest load is shown: an older one finishing last would
  // overwrite the portfolio of the current wallet list.
  const latest = useRef(0)

  const fetchPortfolio = useCallback(() => {
    const id = ++latest.current
    startTransition(async () => {
      try {
        const result = await loadUserPortfolio(wallets)
        if (id !== latest.current) return
        setPortfolio(result)
        setError(null)
      } catch (err) {
        if (id !== latest.current) return
        console.error(err)
        setError('Erreur lors du chargement des positions')
      }
    })
  }, [wallets])

  return { portfolio, fetchPortfolio, isPending, error }
}
