'use client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type {
  PreflightResult,
  PreflightState,
} from '@/lib/execution/cctp/trustline'

type Preflight = PreflightResult & { friendbotUrl: string | null }

function explain(p: Preflight): string {
  const texts: Record<Exclude<PreflightState, 'ready'>, string> = {
    unfunded: `This Stellar account does not exist yet. Send it at least ${p.requiredXlm} XLM first.`,
    'missing-trustline':
      'Stellar accounts must opt in to USDC before they can receive it. Add the USDC trustline (it locks 0.5 XLM of reserve). This happens before any USDC leaves your EVM wallet.',
    'insufficient-xlm': `Your Stellar account needs ${p.requiredXlm} XLM available for the reserve and fees; it has ${p.availableXlm}.`,
    'limit-too-low':
      'Your USDC trustline limit is below this amount. Update the trustline to receive it.',
    'not-authorized': 'The USDC issuer has not authorized your trustline.',
  }
  return p.state === 'ready' ? '' : texts[p.state]
}

export function BridgePreflight({
  result,
  address,
  busy,
  onAddTrustline,
}: {
  result: Preflight
  address: string
  busy: boolean
  onAddTrustline: () => void
}) {
  if (result.state === 'ready') {
    return (
      <p className="text-muted-foreground text-sm">
        Stellar account ready: USDC trustline found.
      </p>
    )
  }
  const canAddTrustline =
    result.state === 'missing-trustline' || result.state === 'limit-too-low'
  return (
    <Alert>
      <AlertTitle>Your Stellar account needs one step first</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <span>{explain(result)}</span>
        {result.state === 'unfunded' && result.friendbotUrl && (
          <a
            className="underline"
            href={`${result.friendbotUrl}?addr=${address}`}
            target="_blank"
            rel="noreferrer"
          >
            Fund it with Friendbot (testnet), then come back
          </a>
        )}
        {canAddTrustline && (
          <Button className="w-fit" disabled={busy} onClick={onAddTrustline}>
            Add USDC to my Stellar wallet
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}
