import { Networks } from '@stellar/stellar-sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PUBLIC_SOROBAN_RPC, blendNetworkFrom, withRpc } from '../api'

describe('blendNetworkFrom', () => {
  it('uses the server RPC and its auth header', () => {
    const n = blendNetworkFrom({
      url: 'https://stellar-mainnet.infura.io/v3/k',
      headers: { Authorization: 'Basic x' },
    })
    expect(n.rpc).toBe('https://stellar-mainnet.infura.io/v3/k')
    expect(n.passphrase).toBe(Networks.PUBLIC)
    expect(n.opts?.headers).toEqual({ Authorization: 'Basic x' })
  })

  it('falls back to the public Soroban RPC, without headers', () => {
    const n = blendNetworkFrom(null)
    expect(n.rpc).toBe(PUBLIC_SOROBAN_RPC)
    expect(n.opts?.headers ?? {}).toEqual({})
  })
})

describe('withRpc', () => {
  const base = blendNetworkFrom({
    url: 'https://stellar-mainnet.infura.io/v3/k',
    headers: { Authorization: 'Basic x' },
  })

  it('keeps the network as is without an explicit rpc', () => {
    expect(withRpc(base)).toBe(base)
  })

  it('swaps in an explicit rpc and drops the provider headers', () => {
    const n = withRpc(base, 'https://other.example/rpc')
    expect(n.rpc).toBe('https://other.example/rpc')
    expect(n.passphrase).toBe(Networks.PUBLIC)
    expect(n.opts).toEqual({ allowHttp: true })
  })
})

describe('blendNetwork', () => {
  afterEach(() => {
    vi.doUnmock('@/config/rpc.server')
  })

  it('is built from serverRpc("stellar"), URL and header', async () => {
    const serverRpc = vi.fn(() => ({
      url: 'https://s.example/k',
      headers: { Authorization: 'Basic z' },
    }))
    vi.doMock('@/config/rpc.server', () => ({ serverRpc }))
    vi.resetModules()
    const { blendNetwork } = await import('../api')
    const n = blendNetwork()
    expect(serverRpc).toHaveBeenCalledWith('stellar')
    expect(n.rpc).toBe('https://s.example/k')
    expect(n.opts?.headers).toEqual({ Authorization: 'Basic z' })
  })
})
