'use client'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CctpSourceChain } from '@/lib/execution/cctp/config'
import type { BridgeQuote } from '@/lib/execution/cctp/view'
import { formatAddress } from '@/lib/utils'

export function BridgeQuoteCard({
  chains,
  sourceChainId,
  onSourceChainId,
  amount,
  onAmount,
  quote,
  recipient,
  evmAddress,
}: {
  chains: readonly CctpSourceChain[]
  /** null until the user (or a valid deep link) picks a chain: no silent default. */
  sourceChainId: number | null
  onSourceChainId: (chainId: number) => void
  amount: string
  onAmount: (amount: string) => void
  quote: BridgeQuote | null
  recipient: string
  evmAddress: string | null
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Transfer</CardTitle>
        <CardDescription>
          To {formatAddress(recipient)} on Stellar — the wallet you signed in
          with.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="bridge-source">From</Label>
          <Select
            value={sourceChainId === null ? '' : String(sourceChainId)}
            onValueChange={(v) => onSourceChainId(Number(v))}
          >
            <SelectTrigger id="bridge-source">
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
          {evmAddress && (
            <p className="text-muted-foreground text-xs">
              EVM account {formatAddress(evmAddress)}
            </p>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="bridge-amount">Amount (USDC)</Label>
          <Input
            id="bridge-amount"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => onAmount(e.target.value.trim())}
          />
        </div>
        {quote && (
          <dl className="grid grid-cols-2 gap-1 text-sm sm:col-span-2">
            <dt className="text-muted-foreground">Speed</dt>
            <dd>
              {quote.tier === 'fast'
                ? 'Fast Transfer — a few minutes'
                : 'Standard — up to ~20 minutes'}
            </dd>
            <dt className="text-muted-foreground">Max fee</dt>
            <dd>
              {quote.maxFee} USDC ({quote.feeBps} bps)
            </dd>
            <dt className="text-muted-foreground">You receive at least</dt>
            <dd>{quote.minimumReceived} USDC on Stellar</dd>
            {quote.cap && (
              <>
                <dt className="text-muted-foreground">Per-transfer cap</dt>
                <dd>{quote.cap} USDC</dd>
              </>
            )}
          </dl>
        )}
      </CardContent>
    </Card>
  )
}
