import 'server-only'

import { Horizon, TransactionBuilder } from '@stellar/stellar-sdk'

import { stellarNetwork } from '@/config/stellar-network'
import {
  stellarHorizonUrl,
  stellarSorobanRpc,
} from '@/config/stellar-network.server'
import { requireStellarSession } from '@/lib/auth/session-guard'
import * as repository from '@/lib/db/repositories/bridge-transfers'
import { bridgeLimiter } from '@/lib/ratelimit'

import { cctpConfig } from './config'
import { burnReceiptClient, verifyBurnReceipt } from './evm-receipt'
import { fetchFeeTiers } from './fees'
import { createIrisClient, irisQueue } from './iris'
import { assertExpectedMessage, parseCctpMessage } from './message'
import {
  assertSignedMint,
  getMintStatus,
  isMessageAlreadyReceived,
  prepareMintXdr,
  submitMint,
} from './mint'
import type { BridgeServiceDeps } from './service'
import {
  assertSignedChangeTrust,
  buildChangeTrustXdr,
  fetchHorizonAccount,
} from './trustline'

const HORIZON_TIMEOUT_MS = 8_000

/**
 * The real I/O of the bridge, read per call (never at import): the dRPC JWT in
 * the Soroban headers expires, and the network comes from the deployment env.
 */
export function bridgeServiceDeps(
  env: Record<string, string | undefined> = process.env
): BridgeServiceDeps {
  const network = stellarNetwork()
  const cctp = cctpConfig(network.id)
  const horizonUrl = stellarHorizonUrl(env)
  const rpc = stellarSorobanRpc(env)
  const { passphrase, usdc } = network

  return {
    session: () => requireStellarSession(),
    limit: (address) => bridgeLimiter.limit(address),
    network,
    cctp,
    env,
    repo: {
      insertTransfer: repository.insertTransfer,
      findTransfer: repository.findTransfer,
      findTransferByBurn: repository.findTransferByBurn,
      listTransfers: repository.listTransfers,
      advanceTransfer: repository.advanceTransfer,
      patchTransfer: repository.patchTransfer,
    },
    feeTiers: (domain) =>
      fetchFeeTiers(domain, {
        irisBaseUrl: cctp.irisBaseUrl,
        queue: irisQueue,
      }),
    iris: createIrisClient({ baseUrl: cctp.irisBaseUrl, queue: irisQueue }),
    horizonAccount: (address) => fetchHorizonAccount(address, { horizonUrl }),
    changeTrustXdr: (address) =>
      buildChangeTrustXdr(address, { horizonUrl, passphrase, usdc }),
    checkSignedChangeTrust: (xdr, source) =>
      assertSignedChangeTrust(xdr, { passphrase, usdc, source }),
    submitClassic: async (xdr) => {
      const tx = TransactionBuilder.fromXDR(xdr, passphrase)
      const res = await new Horizon.Server(horizonUrl).submitTransaction(tx)
      return { hash: res.hash }
    },
    isChangeTrustBy: async (hash, address) => {
      const res = await fetch(`${horizonUrl}/transactions/${hash}`, {
        signal: AbortSignal.timeout(HORIZON_TIMEOUT_MS),
      })
      if (!res.ok) return false
      const tx = (await res.json()) as {
        successful?: boolean
        source_account?: string
        envelope_xdr?: string
      }
      if (!tx.successful || tx.source_account !== address || !tx.envelope_xdr)
        return false
      try {
        assertSignedChangeTrust(tx.envelope_xdr, {
          passphrase,
          usdc,
          source: address,
        })
        return true
      } catch {
        return false
      }
    },
    burnReceipt: (chain, txHash) =>
      verifyBurnReceipt({ chain, txHash, client: burnReceiptClient(chain) }),
    verifyMessage: (message, expected) => {
      const parsed = parseCctpMessage(message)
      assertExpectedMessage(parsed, expected)
      return parsed
    },
    mint: {
      prepare: ({ source, message, attestation }) =>
        prepareMintXdr({
          source,
          message,
          attestation,
          contracts: cctp.stellar,
          rpc,
          passphrase,
        }),
      check: (xdr, expected) =>
        assertSignedMint(xdr, {
          passphrase,
          forwarder: cctp.stellar.forwarder,
          ...expected,
        }),
      hashOf: (xdr) =>
        TransactionBuilder.fromXDR(xdr, passphrase).hash().toString('hex'),
      alreadyReceived: (message) =>
        isMessageAlreadyReceived({
          message,
          contracts: cctp.stellar,
          rpc,
          passphrase,
        }),
      submit: (xdr, recipient) =>
        submitMint(xdr, {
          rpc,
          passphrase,
          usdcContractId: usdc.contractId,
          recipient,
        }),
      status: (hash, recipient) =>
        getMintStatus(hash, {
          rpc,
          usdcContractId: usdc.contractId,
          recipient,
        }),
    },
    now: () => Date.now(),
    log: (event, data) => {
      const line = { event, ...data }
      if (
        event === 'error' ||
        event.endsWith('mismatch') ||
        event.endsWith('_error')
      )
        console.error('[bridge]', line)
      else console.info('[bridge]', line)
    },
  }
}
