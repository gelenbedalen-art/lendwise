import { describe, expect, it, vi } from 'vitest'

import { stellarNetwork } from '@/config/stellar-network'
import type { BridgeTransfer } from '@/lib/db/repositories/bridge-transfers'

import { cctpConfig } from './config'

vi.mock('@/lib/db/postgres', () => ({ db: {} }))

const { toView } = await import('./view')

const network = stellarNetwork({ NEXT_PUBLIC_STELLAR_NETWORK: 'testnet' })
const cctp = cctpConfig('testnet')

const row = (over: Partial<BridgeTransfer> = {}): BridgeTransfer => ({
  id: 't1',
  network: 'testnet',
  status: 'burn_confirmed',
  stellarAddress: 'G',
  evmAddress: null,
  sourceChainId: 84532,
  sourceDomain: 6,
  amount: 10_000_000n,
  maxFee: 1560n,
  feeExecuted: null,
  minFinalityThreshold: 1000,
  finalityThresholdExecuted: null,
  changeTrustTxHash: null,
  approvalTxHash: null,
  burnTxHash: null,
  mintTxHash: null,
  irisEventNonce: null,
  message: null,
  attestation: null,
  mintedAmount: null,
  error: null,
  createdAt: new Date('2026-10-20T10:00:00Z'),
  updatedAt: new Date('2026-10-20T10:00:00Z'),
  ...over,
})

describe('toView tier', () => {
  it('derives the requested tier from minFinalityThreshold', () => {
    expect(
      toView(row({ minFinalityThreshold: 1000 }), cctp, network).tier
    ).toBe('fast')
    expect(toView(row({ minFinalityThreshold: 500 }), cctp, network).tier).toBe(
      'fast'
    )
    expect(
      toView(row({ minFinalityThreshold: 2000 }), cctp, network).tier
    ).toBe('standard')
  })

  it('has no executed tier before the attestation', () => {
    expect(toView(row(), cctp, network).tierExecuted).toBeNull()
  })

  it('derives the executed tier, so the UI can show a Fast to Standard fallback', () => {
    const fell = toView(row({ finalityThresholdExecuted: 2000 }), cctp, network)
    expect(fell).toMatchObject({ tier: 'fast', tierExecuted: 'standard' })
    const fast = toView(row({ finalityThresholdExecuted: 1000 }), cctp, network)
    expect(fast.tierExecuted).toBe('fast')
  })

  it('carries no bigint, so a server action can serialise it', () => {
    expect(() =>
      JSON.stringify(
        toView(row({ mintedAmount: 1n, feeExecuted: 1n }), cctp, network)
      )
    ).not.toThrow()
  })
})
