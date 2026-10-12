'use client'

import { useCallback, useState, useTransition } from 'react'

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

  const fetchPortfolio = useCallback(() => {
    startTransition(async () => {
      try {
        setPortfolio(await loadUserPortfolio(wallets))
        setError(null)
      } catch (err) {
        console.error(err)
        setError('Erreur lors du chargement des positions')
      }
    })
  }, [wallets])

  return { portfolio, fetchPortfolio, isPending, error }
}
