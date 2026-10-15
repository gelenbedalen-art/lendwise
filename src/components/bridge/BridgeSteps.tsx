'use client'

import { useEffect, useState } from 'react'

import { Check, Circle, CircleAlert, ExternalLink, Loader2 } from 'lucide-react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { BridgeTransferView } from '@/lib/execution/cctp/view'

import {
  STATUS_TEXT,
  type StepState,
  attestationNote,
  bridgeSteps,
  elapsedSince,
  formatElapsed,
} from './steps'

function StepIcon({ state }: { state: StepState }) {
  if (state === 'done') return <Check className="size-4 text-emerald-600" />
  if (state === 'active') return <Loader2 className="size-4 animate-spin" />
  if (state === 'failed')
    return <CircleAlert className="text-destructive size-4" />
  return <Circle className="text-muted-foreground size-4" />
}

/** Ticks every second on the client clock while the transfer waits on Circle. */
function useElapsed(createdAt: string, waiting: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!waiting) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [waiting])
  return elapsedSince(createdAt, now)
}

export function BridgeSteps({ transfer }: { transfer: BridgeTransferView }) {
  const waiting =
    transfer.status === 'burn_submitted' || transfer.status === 'burn_confirmed'
  const elapsed = useElapsed(transfer.createdAt, waiting)
  const note = attestationNote(transfer)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{transfer.amount} USDC → Stellar</CardTitle>
        <CardDescription>{STATUS_TEXT[transfer.status]}</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-3">
          {bridgeSteps(transfer).map((s) => (
            <li key={s.key} className="flex flex-col gap-1 text-sm">
              <div className="flex items-center gap-3">
                <StepIcon state={s.state} />
                <span className="flex-1">{s.label}</span>
                {s.link && (
                  <a
                    className="inline-flex items-center gap-1 underline"
                    href={s.link}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Transaction <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
              {s.key === 'attestation' && s.state !== 'todo' && (
                <div className="text-muted-foreground flex flex-col gap-0.5 pl-7 text-xs">
                  {waiting && <span>Elapsed: {formatElapsed(elapsed)}</span>}
                  {note && <span>{note}</span>}
                </div>
              )}
            </li>
          ))}
        </ol>
        {transfer.mintedAmount && (
          <p className="mt-4 text-sm">
            Received {transfer.mintedAmount} USDC on Stellar
            {transfer.feeExecuted
              ? ` (Circle fee ${transfer.feeExecuted} USDC)`
              : ''}
            .
          </p>
        )}
        {transfer.error && (
          <p className="text-destructive mt-4 text-sm">{transfer.error}</p>
        )}
      </CardContent>
    </Card>
  )
}
