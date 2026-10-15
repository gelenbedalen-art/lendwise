'use client'

import { useEffect, useMemo, useState } from 'react'

import Link from 'next/link'

import {
  getAccount,
  readContract,
  sendTransaction,
  switchChain,
  waitForTransactionReceipt,
  writeContract,
} from '@wagmi/core'
import { erc20Abi, parseUnits } from 'viem'
import { useAccount, useConfig } from 'wagmi'

import {
  buildChangeTrust,
  createBridgeTransfer,
  importBridgeBurn,
  listBridgeTransfers,
  preflightBridge,
  prepareBridgeMint,
  quoteBridge,
  recordApproval,
  recordBurn,
  submitBridgeMint,
  submitChangeTrust,
} from '@/app/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { StellarNetworkId } from '@/config/stellar-network'
import { useStellarWallet } from '@/contexts/StellarWalletContext'
import { useBridgeTransfer } from '@/hooks/useBridgeTransfer'
import { cctpConfig } from '@/lib/execution/cctp/config'
import type { PreflightResult } from '@/lib/execution/cctp/trustline'
import type { BridgeQuote, BridgeTransferView } from '@/lib/execution/cctp/view'
import { requestPortfolioRefresh } from '@/lib/portfolio/refresh-event'
import { useWalletStore } from '@/stores/walletStore'

import { BridgePreflight } from './BridgePreflight'
import { BridgeQuoteCard } from './BridgeQuoteCard'
import { BridgeSteps } from './BridgeSteps'
import { BridgeTransfersList } from './BridgeTransfersList'

type Preflight = PreflightResult & { friendbotUrl: string | null }

const QUOTE_DEBOUNCE_MS = 400

/** viem/wagmi errors carry a one-line `shortMessage`; their `message` is a page long. */
function readable(err: unknown): string {
  const short = (err as { shortMessage?: unknown } | null)?.shortMessage
  if (typeof short === 'string') return short
  return err instanceof Error ? err.message : String(err)
}

export interface BridgeFlowProps {
  network: StellarNetworkId
  initialAmount: string | null
  initialSourceChainId: number | null
  productId: string | null
  /** Resolved on the server from `product`; null when the page had none. */
  nextStep: { venue: string; href: string } | null
}

export function BridgeFlow({
  network,
  initialAmount,
  initialSourceChainId,
  productId,
  nextStep,
}: BridgeFlowProps) {
  const config = useConfig()
  const { isConnected: evmConnected, address: evmAddress } = useAccount()
  const { signTransaction } = useStellarWallet()
  const { wallets } = useWalletStore()
  const chains = useMemo(() => cctpConfig(network).sourceChains, [network])

  // The recipient is always the signed-in Stellar account (SEP-10 session).
  const session = useMemo(
    () =>
      wallets.find(
        (w) =>
          w.chainFamily === 'stellar' &&
          w.stellarSession &&
          w.stellarSession.expiresAt * 1000 > Date.now()
      )?.stellarSession ?? null,
    [wallets]
  )
  const ready = evmConnected && session !== null

  // No silent fallback: without a valid `source` the user must choose.
  const [sourceChainId, setSourceChainId] = useState<number | null>(
    initialSourceChainId
  )
  const [amount, setAmount] = useState(initialAmount ?? '')
  const [quote, setQuote] = useState<BridgeQuote | null>(null)
  const [preflight, setPreflight] = useState<Preflight | null>(null)
  const [changeTrustHash, setChangeTrustHash] = useState<string | null>(null)
  const [transfers, setTransfers] = useState<BridgeTransferView[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [flowError, setFlowError] = useState<string | null>(null)
  const {
    transfer,
    setTransfer,
    refresh,
    error: refreshError,
  } = useBridgeTransfer()
  const hasTransfer = transfer !== null

  // Quote and pre-flight follow the inputs, debounced, while no transfer runs.
  useEffect(() => {
    setQuote(null)
    setPreflight(null)
    if (!ready || !amount || sourceChainId === null || hasTransfer) return
    let cancelled = false
    const timer = setTimeout(async () => {
      const [q, p] = await Promise.all([
        quoteBridge({ sourceChainId, amount }),
        preflightBridge({ amount }),
      ])
      if (cancelled) return
      if (!q.ok) return setFlowError(q.error)
      if (!p.ok) return setFlowError(p.error)
      setFlowError(null)
      setQuote(q.value)
      setPreflight(p.value)
    }, QUOTE_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [ready, amount, sourceChainId, hasTransfer])

  // The session's transfers, reloaded whenever the one on screen changes state.
  useEffect(() => {
    if (!session) return
    void listBridgeTransfers().then((r) => r.ok && setTransfers(r.value))
  }, [session, transfer?.status])

  useEffect(() => {
    if (transfer?.status === 'completed') requestPortfolioRefresh()
  }, [transfer?.status])

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label)
    setFlowError(null)
    try {
      await fn()
    } catch (err) {
      setFlowError(readable(err))
    } finally {
      setBusy(null)
    }
  }

  const recheck = async (forAmount: string) => {
    const p = await preflightBridge({ amount: forAmount })
    if (p.ok) setPreflight(p.value)
  }

  const addTrustline = () =>
    run('Sign the USDC trustline in your Stellar wallet…', async () => {
      if (!session) return
      const built = await buildChangeTrust()
      if (!built.ok) throw new Error(built.error)
      const signed = await signTransaction(built.value.xdr, session.address)
      const sent = await submitChangeTrust({ signedXdr: signed })
      if (!sent.ok) throw new Error(sent.error)
      setChangeTrustHash(sent.value.hash)
      await recheck(transfer?.amount ?? amount)
    })

  const start = () =>
    run('Checking your USDC balance…', async () => {
      const chain = chains.find((c) => c.chainId === sourceChainId)
      if (sourceChainId === null) throw new Error('Choose a source chain.')
      if (!chain) throw new Error('Choose a source chain.')
      if (getAccount(config).chainId !== chain.chainId) {
        setBusy(`Switch your wallet to ${chain.name}…`)
        await switchChain(config, { chainId: chain.chainId })
      }
      const owner = getAccount(config).address
      if (!owner) throw new Error('Connect an EVM wallet first.')
      const wanted = parseUnits(amount, 6)
      const balance = await readContract(config, {
        chainId: chain.chainId,
        address: chain.usdc,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [owner],
      })
      if (balance < wanted) throw new Error(`Not enough USDC on ${chain.name}.`)

      const created = await createBridgeTransfer({
        sourceChainId,
        amount,
        changeTrustTxHash: changeTrustHash ?? undefined,
      })
      if (!created.ok) throw new Error(created.error)
      const { transfer: planned, burn } = created.value
      setTransfer(planned)

      let burned = false
      try {
        const value = BigInt(burn.amount)
        const allowance = await readContract(config, {
          chainId: burn.chainId,
          address: burn.usdc,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [owner, burn.to],
        })
        if (allowance < value) {
          setBusy('Approve USDC in your wallet…')
          const approval = await writeContract(config, {
            chainId: burn.chainId,
            address: burn.usdc,
            abi: erc20Abi,
            functionName: 'approve',
            args: [burn.to, value],
          })
          await recordApproval({ id: planned.id, txHash: approval })
          setBusy('Waiting for the approval…')
          const receipt = await waitForTransactionReceipt(config, {
            chainId: burn.chainId,
            hash: approval,
          })
          if (receipt.status !== 'success')
            throw new Error('The USDC approval reverted.')
        }

        setBusy('Confirm the burn in your wallet…')
        const hash = await sendTransaction(config, {
          chainId: burn.chainId,
          to: burn.to,
          data: burn.data,
        })
        burned = true
        const recorded = await recordBurn({ id: planned.id, txHash: hash })
        if (!recorded.ok)
          throw new Error(
            `Burn sent (${hash}) but not recorded: ${recorded.error} Use “Resume from a burn hash” below.`
          )
        setTransfer(recorded.value)

        setBusy('Waiting for the burn to confirm…')
        const receipt = await waitForTransactionReceipt(config, {
          chainId: burn.chainId,
          hash,
        })
        if (receipt.status !== 'success')
          setFlowError(
            'The burn reverted on the source chain. No USDC left your wallet.'
          )
        await refresh(planned.id)
      } catch (err) {
        // Nothing left the wallet: drop the planned transfer and let the user retry.
        if (!burned) setTransfer(null)
        throw err
      }
    })

  const mint = (t: BridgeTransferView) =>
    run('Preparing the mint…', async () => {
      if (!session) return
      const prepared = await prepareBridgeMint({ id: t.id })
      if (!prepared.ok) {
        if (prepared.code?.startsWith('preflight-')) await recheck(t.amount)
        throw new Error(prepared.error)
      }
      if ('alreadyReceived' in prepared.value) {
        setTransfer(prepared.value.transfer)
        return
      }
      setBusy('Sign the mint in your Stellar wallet…')
      const signed = await signTransaction(prepared.value.xdr, session.address)
      const sent = await submitBridgeMint({ id: t.id, signedXdr: signed })
      if (!sent.ok) throw new Error(sent.error)
      setTransfer(sent.value)
    })

  const resume = (t: BridgeTransferView) => {
    setFlowError(null)
    setPreflight(null)
    setTransfer(t)
    void refresh(t.id)
  }

  const importBurn = (chainId: number, hash: `0x${string}`) =>
    run('Looking up the burn…', async () => {
      const r = await importBridgeBurn({ sourceChainId: chainId, txHash: hash })
      if (!r.ok) throw new Error(r.error)
      resume(r.value)
    })

  const canMint =
    transfer !== null &&
    (transfer.status === 'attested' ||
      (transfer.status === 'failed' &&
        transfer.resumable &&
        transfer.feeExecuted !== null))
  const canRetry =
    transfer !== null &&
    transfer.status === 'failed' &&
    transfer.resumable &&
    transfer.feeExecuted === null
  // Never offer a fresh start once USDC may have left the source chain.
  const canStartNew =
    transfer !== null &&
    (transfer.hashes.burn === null ||
      transfer.status === 'completed' ||
      (transfer.status === 'failed' && !transfer.resumable))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Bridge USDC to Stellar</h1>
        <p className="text-muted-foreground text-sm">
          Native USDC from {chains.map((c) => c.name).join(', ')} to your
          Stellar wallet, through Circle CCTP.
          {network === 'testnet' &&
            ' Testnet: test tokens only, no real funds.'}
        </p>
      </div>

      {!ready && (
        <Alert>
          <AlertDescription>
            Connect an EVM wallet and sign in with your Stellar wallet (top
            right) to bridge.
            {network === 'testnet' &&
              ' Put both wallets on their test networks.'}
          </AlertDescription>
        </Alert>
      )}

      {ready && session && !transfer && (
        <>
          <BridgeQuoteCard
            chains={chains}
            sourceChainId={sourceChainId}
            onSourceChainId={setSourceChainId}
            amount={amount}
            onAmount={setAmount}
            quote={quote}
            recipient={session.address}
            evmAddress={evmAddress ?? null}
          />
          {preflight && (
            <BridgePreflight
              result={preflight}
              address={session.address}
              busy={busy !== null}
              onAddTrustline={addTrustline}
            />
          )}
          <Button
            className="w-fit"
            disabled={
              sourceChainId === null ||
              !quote ||
              preflight?.state !== 'ready' ||
              busy !== null
            }
            onClick={start}
          >
            Bridge {quote?.amount ?? ''} USDC to Stellar
          </Button>
        </>
      )}

      {transfer && session && (
        <>
          <BridgeSteps transfer={transfer} />
          {preflight && preflight.state !== 'ready' && (
            <BridgePreflight
              result={preflight}
              address={session.address}
              busy={busy !== null}
              onAddTrustline={addTrustline}
            />
          )}
          <div className="flex flex-wrap gap-3">
            {canMint && (
              <Button disabled={busy !== null} onClick={() => mint(transfer)}>
                Mint USDC on Stellar
              </Button>
            )}
            {canRetry && (
              <Button
                variant="outline"
                disabled={busy !== null}
                onClick={() => resume(transfer)}
              >
                Retry
              </Button>
            )}
            {transfer.status === 'completed' && (
              <Button asChild>
                <Link href="/portfolio">View in portfolio</Link>
              </Button>
            )}
            {transfer.status === 'completed' && productId && nextStep && (
              <Button variant="outline" asChild>
                {/^https?:\/\//.test(nextStep.href) ? (
                  <a href={nextStep.href} target="_blank" rel="noreferrer">
                    Next step: supply on {nextStep.venue}
                  </a>
                ) : (
                  <Link href={nextStep.href}>
                    Next step: supply on {nextStep.venue}
                  </Link>
                )}
              </Button>
            )}
            {canStartNew && (
              <Button
                variant="ghost"
                onClick={() => {
                  setTransfer(null)
                  setChangeTrustHash(null)
                }}
              >
                New transfer
              </Button>
            )}
          </div>
        </>
      )}

      {busy && <p className="text-muted-foreground text-sm">{busy}</p>}
      {(flowError ?? refreshError) && (
        <Alert variant="destructive">
          <AlertDescription>{flowError ?? refreshError}</AlertDescription>
        </Alert>
      )}

      {ready && (
        <BridgeTransfersList
          transfers={transfers}
          chains={chains}
          currentId={transfer?.id ?? null}
          busy={busy !== null}
          onResume={resume}
          onImport={importBurn}
        />
      )}
    </div>
  )
}
