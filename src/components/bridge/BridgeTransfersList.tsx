'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CctpSourceChain } from '@/lib/execution/cctp/config'
import type { BridgeTransferView } from '@/lib/execution/cctp/view'

import { STATUS_TEXT } from './steps'

const TX_HASH = /^0x[0-9a-fA-F]{64}$/

export function BridgeTransfersList({
  transfers,
  chains,
  currentId,
  busy,
  onResume,
  onImport,
}: {
  transfers: BridgeTransferView[]
  chains: readonly CctpSourceChain[]
  currentId: string | null
  busy: boolean
  onResume: (t: BridgeTransferView) => void
  onImport: (sourceChainId: number, txHash: `0x${string}`) => void
}) {
  // No preselected chain: importing a burn needs an explicit source.
  const [chainId, setChainId] = useState<number | null>(null)
  const [hash, setHash] = useState('')
  const open = transfers.filter((t) => t.resumable && t.id !== currentId)
  const done = transfers.filter((t) => t.status === 'completed').slice(0, 5)
  const chainName = (id: number) =>
    chains.find((c) => c.chainId === id)?.name ?? `chain ${id}`

  const row = (t: BridgeTransferView, action: React.ReactNode) => (
    <li
      key={t.id}
      className="flex flex-wrap items-center justify-between gap-2 text-sm"
    >
      <span>
        {t.amount} USDC from {chainName(t.sourceChainId)} ·{' '}
        {new Date(t.createdAt).toLocaleString()} · {STATUS_TEXT[t.status]}
      </span>
      {action}
    </li>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your transfers</CardTitle>
        <CardDescription>
          Once USDC has left the source chain, a transfer can always be finished
          here, even after closing this page.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {open.length === 0 && done.length === 0 && (
          <p className="text-muted-foreground text-sm">No transfers yet.</p>
        )}
        <ul className="flex flex-col gap-2">
          {open.map((t) =>
            row(
              t,
              <Button size="sm" disabled={busy} onClick={() => onResume(t)}>
                Resume
              </Button>
            )
          )}
          {done.map((t) =>
            row(
              t,
              t.links.mint ? (
                <a
                  className="underline"
                  href={t.links.mint}
                  target="_blank"
                  rel="noreferrer"
                >
                  Mint transaction
                </a>
              ) : null
            )
          )}
        </ul>
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
          onSubmit={(e) => {
            e.preventDefault()
            if (chainId !== null && TX_HASH.test(hash))
              onImport(chainId, hash as `0x${string}`)
          }}
        >
          <Select
            value={chainId === null ? '' : String(chainId)}
            onValueChange={(v) => setChainId(Number(v))}
          >
            <SelectTrigger
              className="sm:w-48"
              aria-label="Source chain of the burn"
            >
              <SelectValue placeholder="Choose a source chain" />
            </SelectTrigger>
            <SelectContent>
              {chains.map((c) => (
                <SelectItem key={c.chainId} value={String(c.chainId)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            aria-label="Burn transaction hash"
            placeholder="Burn transaction hash (0x…)"
            value={hash}
            onChange={(e) => setHash(e.target.value.trim())}
          />
          <Button
            type="submit"
            variant="outline"
            disabled={busy || chainId === null || !TX_HASH.test(hash)}
          >
            Resume from a burn hash
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
