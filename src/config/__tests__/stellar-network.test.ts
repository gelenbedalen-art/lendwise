import { Asset, Networks } from '@stellar/stellar-sdk'
import { describe, expect, it } from 'vitest'

import {
  STELLAR_NETWORKS,
  stellarNetwork,
  stellarNetworkId,
  stellarTxUrl,
} from '../stellar-network'
import { stellarHorizonUrl, stellarSorobanRpc } from '../stellar-network.server'

describe('stellarNetworkId', () => {
  it('defaults to mainnet', () => {
    expect(stellarNetworkId({})).toBe('mainnet')
  })

  it('reads testnet from NEXT_PUBLIC_STELLAR_NETWORK', () => {
    expect(stellarNetworkId({ NEXT_PUBLIC_STELLAR_NETWORK: 'testnet' })).toBe(
      'testnet'
    )
    expect(stellarNetworkId({ NEXT_PUBLIC_STELLAR_NETWORK: ' testnet ' })).toBe(
      'testnet'
    )
  })

  it('treats any other value as mainnet', () => {
    expect(stellarNetworkId({ NEXT_PUBLIC_STELLAR_NETWORK: 'futurenet' })).toBe(
      'mainnet'
    )
  })

  it('forces mainnet in production, whatever the variable says', () => {
    expect(
      stellarNetworkId({
        NEXT_PUBLIC_STELLAR_NETWORK: 'testnet',
        VERCEL_ENV: 'production',
      })
    ).toBe('mainnet')
    expect(
      stellarNetworkId({
        NEXT_PUBLIC_STELLAR_NETWORK: 'testnet',
        NEXT_PUBLIC_VERCEL_ENV: 'production',
      })
    ).toBe('mainnet')
  })
})

describe('stellarNetwork', () => {
  it('uses the SDK passphrases', () => {
    expect(stellarNetwork({}).passphrase).toBe(Networks.PUBLIC)
    expect(
      stellarNetwork({ NEXT_PUBLIC_STELLAR_NETWORK: 'testnet' }).passphrase
    ).toBe(Networks.TESTNET)
  })

  it.each(['mainnet', 'testnet'] as const)(
    'pins the %s USDC contract id to the asset contract of its issuer',
    (id) => {
      const net = STELLAR_NETWORKS[id]
      expect(net.usdc.contractId).toBe(
        new Asset('USDC', net.usdc.issuer).contractId(net.passphrase)
      )
    }
  )

  it('has a Friendbot only on testnet', () => {
    expect(STELLAR_NETWORKS.mainnet.friendbotUrl).toBeNull()
    expect(STELLAR_NETWORKS.testnet.friendbotUrl).toBe(
      'https://friendbot.stellar.org'
    )
  })

  it('links a transaction on the network explorer', () => {
    expect(stellarTxUrl('abc', STELLAR_NETWORKS.testnet)).toBe(
      'https://stellar.expert/explorer/testnet/tx/abc'
    )
  })
})

describe('server endpoints', () => {
  it('keeps STELLAR_HORIZON_URL as an override', () => {
    expect(
      stellarHorizonUrl({ STELLAR_HORIZON_URL: 'https://dead.invalid' })
    ).toBe('https://dead.invalid')
    expect(stellarHorizonUrl({ NEXT_PUBLIC_STELLAR_NETWORK: 'testnet' })).toBe(
      'https://horizon-testnet.stellar.org'
    )
  })

  it('uses the server RPC on mainnet', () => {
    expect(
      stellarSorobanRpc({ RPC_URL_STELLAR: 'https://rpc.example/stellar' })
    ).toEqual({ url: 'https://rpc.example/stellar', headers: {} })
  })

  it('uses the public testnet RPC on testnet, never the provider key', () => {
    expect(
      stellarSorobanRpc({
        NEXT_PUBLIC_STELLAR_NETWORK: 'testnet',
        RPC_URL_STELLAR: 'https://rpc.example/stellar',
      })
    ).toEqual({ url: 'https://soroban-testnet.stellar.org', headers: {} })
  })
})
