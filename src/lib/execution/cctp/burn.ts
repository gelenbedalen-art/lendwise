import { StrKey } from '@stellar/stellar-sdk'
import { type Hex, encodeFunctionData } from 'viem'

import { tokenMessengerV2Abi } from './abis'
import {
  type CctpSourceChain,
  STELLAR_CCTP_DOMAIN,
  type StellarCctpContracts,
} from './config'
import type { BridgeFeePlan } from './fees'
import { contractIdToBytes32, encodeForwarderHookData } from './hook'

export interface BurnPlan {
  chainId: number
  /** TokenMessengerV2 of the source chain. */
  to: Hex
  data: Hex
  usdc: Hex
  amount: bigint
  maxFee: bigint
  minFinalityThreshold: number
  hookData: Hex
  forwarder32: Hex
}

/**
 * The source-chain burn. Both `mintRecipient` and `destinationCaller` are the
 * CctpForwarder: Circle documents that routing either to the user's own
 * address leaves the USDC permanently unrecoverable. The user is reached only
 * through the hook, which the forwarder reads to forward the mint.
 */
export function planBurn(input: {
  sourceChain: CctpSourceChain
  amount: bigint
  fee: BridgeFeePlan
  stellarRecipient: string
  contracts: StellarCctpContracts
}): BurnPlan {
  const { sourceChain, amount, fee, stellarRecipient, contracts } = input
  if (!StrKey.isValidEd25519PublicKey(stellarRecipient)) {
    throw new Error('The recipient must be a Stellar account (G…)')
  }
  if (amount <= 0n) throw new Error('The burn amount must be positive')
  if (fee.maxFee < 0n || fee.maxFee >= amount) {
    throw new Error('maxFee must be below the burn amount')
  }
  const forwarder32 = contractIdToBytes32(contracts.forwarder)
  const hookData = encodeForwarderHookData(stellarRecipient)
  const data = encodeFunctionData({
    abi: tokenMessengerV2Abi,
    functionName: 'depositForBurnWithHook',
    args: [
      amount,
      STELLAR_CCTP_DOMAIN,
      forwarder32,
      sourceChain.usdc,
      forwarder32,
      fee.maxFee,
      fee.minFinalityThreshold,
      hookData,
    ],
  })
  return {
    chainId: sourceChain.chainId,
    to: sourceChain.tokenMessengerV2,
    data,
    usdc: sourceChain.usdc,
    amount,
    maxFee: fee.maxFee,
    minFinalityThreshold: fee.minFinalityThreshold,
    hookData,
    forwarder32,
  }
}
