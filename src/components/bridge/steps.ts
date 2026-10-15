import type { BridgeTransferStatus } from '@/lib/db/repositories/bridge-transfers'
import type { BridgeTransferView } from '@/lib/execution/cctp/view'

export type StepKey = 'trustline' | 'approval' | 'burn' | 'attestation' | 'mint'
export type StepState = 'todo' | 'active' | 'done' | 'failed'

export interface StepView {
  key: StepKey
  label: string
  state: StepState
  link: string | null
}

const STEPS: {
  key: StepKey
  label: string
  link: (t: BridgeTransferView) => string | null
}[] = [
  {
    key: 'trustline',
    label: 'USDC trustline on Stellar',
    link: (t) => t.links.changeTrust,
  },
  { key: 'approval', label: 'USDC approval', link: (t) => t.links.approval },
  { key: 'burn', label: 'Burn on the source chain', link: (t) => t.links.burn },
  { key: 'attestation', label: "Circle's attestation", link: () => null },
  { key: 'mint', label: 'Mint on Stellar', link: (t) => t.links.mint },
]

export const STATUS_TEXT: Record<BridgeTransferStatus, string> = {
  planned: 'Waiting for the burn',
  burn_submitted: 'Burn sent — waiting for its confirmation',
  burn_confirmed: "Burn confirmed — waiting for Circle's attestation",
  attested: 'Attested — sign the mint in your Stellar wallet',
  mint_submitted: 'Mint sent to Stellar',
  completed: 'Done — native USDC is in your Stellar wallet',
  failed: 'Stopped',
}

/** Index in STEPS of the step the transfer is at; 5 once completed. */
export function currentStep(t: BridgeTransferView): number {
  switch (t.status) {
    case 'planned':
      return 1
    case 'burn_submitted':
      return 2
    case 'burn_confirmed':
      return 3
    case 'attested':
    case 'mint_submitted':
      return 4
    case 'completed':
      return 5
    case 'failed':
      // Attested (a fee is known) or a mint was sent: the mint failed.
      if (t.hashes.mint || t.feeExecuted !== null) return 4
      // Burn confirmed (resumable) but no attestation: the attestation check failed.
      if (t.resumable) return 3
      return t.hashes.burn ? 2 : 1
  }
}

export function bridgeSteps(t: BridgeTransferView): StepView[] {
  const at = currentStep(t)
  return STEPS.map((s, i) => ({
    key: s.key,
    label: s.label,
    link: s.link(t),
    state:
      i < at
        ? 'done'
        : i > at
          ? 'todo'
          : t.status === 'failed'
            ? 'failed'
            : 'active',
  }))
}

/**
 * What to tell the user about the speed of the attestation, or null for a
 * plain Fast transfer. A Standard request is announced up front; a Fast
 * request that Circle executed as Standard is a fallback.
 */
export function attestationNote(t: BridgeTransferView): string | null {
  if (t.tier === 'standard') return 'Standard transfer: ~15–20 min'
  if (t.tierExecuted === 'standard')
    return 'Circle fell back to a Standard transfer.'
  return null
}

/** Milliseconds since `createdAt` on the given client clock; never negative. */
export function elapsedSince(createdAt: string, nowMs: number): number {
  return Math.max(0, nowMs - Date.parse(createdAt))
}

const pad2 = (n: number) => String(n).padStart(2, '0')

export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h} h ${pad2(m)} min`
  if (m > 0) return `${m} min ${pad2(s)} s`
  return `${s} s`
}
