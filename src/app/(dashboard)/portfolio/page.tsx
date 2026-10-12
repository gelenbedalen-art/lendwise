import { Portfolio } from '@/components/portfolio'

/** Server actions invoked from this page inherit this limit (seconds). */
export const maxDuration = 60

export default async function PortfolioPage() {
  return <Portfolio />
}
