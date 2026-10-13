import { describe, expect, it } from 'vitest'

import {
  RPC_NETWORKS,
  isRpcNetwork,
  isRpcProvider,
  rpcUrl,
} from './rpc-providers'

describe('rpcUrl', () => {
  it('builds Infura URLs from the registry slug', () => {
    expect(rpcUrl('infura', 'ethereum', 'k1')).toBe(
      'https://mainnet.infura.io/v3/k1'
    )
    expect(rpcUrl('infura', 'linea', 'k1')).toBe(
      'https://linea-mainnet.infura.io/v3/k1'
    )
    expect(rpcUrl('infura', 'stellar', 'k1')).toBe(
      'https://stellar-mainnet.infura.io/v3/k1'
    )
  })

  it('serves every network on Infura', () => {
    for (const n of RPC_NETWORKS) {
      expect(rpcUrl('infura', n, 'k')).toMatch(
        /^https:\/\/[a-z]+(-mainnet)?\.infura\.io\/v3\/k$/
      )
    }
  })

  it('refuses an empty key instead of building a broken URL', () => {
    expect(() => rpcUrl('infura', 'base', '')).toThrow(/key/)
  })
})

describe('guards', () => {
  it('recognises networks and providers', () => {
    expect(isRpcNetwork('linea')).toBe(true)
    expect(isRpcNetwork('gnosis')).toBe(false)
    expect(isRpcProvider('infura')).toBe(true)
    expect(isRpcProvider('alchemy')).toBe(false)
    expect(isRpcProvider(undefined)).toBe(false)
  })
})
