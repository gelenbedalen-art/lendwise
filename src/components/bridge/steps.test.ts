import { describe, expect, it } from 'vitest'

import type { BridgeTransferView } from '@/lib/execution/cctp/view'

import {
  attestationNote,
  bridgeSteps,
  currentStep,
  elapsedSince,
  formatElapsed,
} from './steps'

const view = (over: Partial<BridgeTransferView> = {}): BridgeTransferView => ({
  id: 't1',
  network: 'testnet',
  status: 'planned',
  tier: 'fast',
  tierExecuted: null,
  sourceChainId: 84532,
  amount: '10',
  maxFee: '0.00156',
  feeExecuted: null,
  mintedAmount: null,
  hashes: { changeTrust: null, approval: null, burn: null, mint: null },
  links: { changeTrust: null, approval: null, burn: null, mint: null },
  error: null,
  resumable: false,
  createdAt: '2026-10-20T10:00:00.000Z',
  ...over,
})

const states = (t: BridgeTransferView) => bridgeSteps(t).map((s) => s.state)

describe('bridgeSteps', () => {
  it('a planned transfer waits on the approval', () => {
    expect(states(view())).toEqual(['done', 'active', 'todo', 'todo', 'todo'])
  })

  it('waits on the attestation once the burn is confirmed', () => {
    expect(states(view({ status: 'burn_confirmed', resumable: true }))).toEqual(
      ['done', 'done', 'done', 'active', 'todo']
    )
  })

  it('marks every step done when completed', () => {
    expect(states(view({ status: 'completed' }))).toEqual(Array(5).fill('done'))
    expect(currentStep(view({ status: 'completed' }))).toBe(5)
  })

  it('places a failure after the attestation on the mint', () => {
    const t = view({ status: 'failed', resumable: true, feeExecuted: '0.0013' })
    expect(states(t)).toEqual(['done', 'done', 'done', 'done', 'failed'])
  })

  it('places a failed attestation check on the attestation step', () => {
    const t = view({ status: 'failed', resumable: true })
    expect(states(t)).toEqual(['done', 'done', 'done', 'failed', 'todo'])
  })

  it('places a reverted burn on the burn step', () => {
    const t = view({
      status: 'failed',
      resumable: false,
      hashes: { changeTrust: null, approval: null, burn: '0xab', mint: null },
    })
    expect(states(t)).toEqual(['done', 'done', 'failed', 'todo', 'todo'])
  })

  it('carries each step its explorer link', () => {
    const links = {
      changeTrust: 'https://stellar.expert/explorer/testnet/tx/ct',
      approval: 'https://sepolia.basescan.org/tx/0xap',
      burn: 'https://sepolia.basescan.org/tx/0xbu',
      mint: 'https://stellar.expert/explorer/testnet/tx/mi',
    }
    expect(
      bridgeSteps(view({ status: 'completed', links })).map((s) => s.link)
    ).toEqual([links.changeTrust, links.approval, links.burn, null, links.mint])
  })
})

describe('attestationNote', () => {
  it('announces the Standard delay when Standard was requested', () => {
    expect(attestationNote(view({ tier: 'standard' }))).toBe(
      'Standard transfer: ~15–20 min'
    )
  })

  it('signals a fallback when Fast was requested but Standard executed', () => {
    expect(
      attestationNote(view({ tier: 'fast', tierExecuted: 'standard' }))
    ).toBe('Circle fell back to a Standard transfer.')
  })

  it('says nothing for a Fast transfer, attested or not', () => {
    expect(
      attestationNote(view({ tier: 'fast', tierExecuted: null }))
    ).toBeNull()
    expect(
      attestationNote(view({ tier: 'fast', tierExecuted: 'fast' }))
    ).toBeNull()
  })

  it('does not call a Standard transfer a fallback', () => {
    expect(
      attestationNote(view({ tier: 'standard', tierExecuted: 'standard' }))
    ).toBe('Standard transfer: ~15–20 min')
  })
})

describe('elapsed time', () => {
  it('measures from createdAt on the given clock', () => {
    const now = Date.parse('2026-10-20T10:02:05.000Z')
    expect(elapsedSince('2026-10-20T10:00:00.000Z', now)).toBe(125_000)
  })

  it('never goes negative when the client clock is behind', () => {
    const now = Date.parse('2026-10-20T09:59:00.000Z')
    expect(elapsedSince('2026-10-20T10:00:00.000Z', now)).toBe(0)
  })

  it('formats seconds, minutes and hours', () => {
    expect(formatElapsed(0)).toBe('0 s')
    expect(formatElapsed(42_000)).toBe('42 s')
    expect(formatElapsed(125_000)).toBe('2 min 05 s')
    expect(formatElapsed(3_725_000)).toBe('1 h 02 min')
  })
})
