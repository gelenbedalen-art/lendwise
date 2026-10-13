import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveServerRpc, rpcOverrideVar } from './rpc.server'

const base = {
  NEXT_PUBLIC_RPC_PROVIDER: 'infura',
  RPC_API_KEY: 'serverkey',
  RPC_API_KEY_SECRET: 'serversecret',
}
const basic = `Basic ${Buffer.from(':serversecret').toString('base64')}`

describe('resolveServerRpc', () => {
  it('uses the server key and sends the secret as Basic auth', () => {
    expect(resolveServerRpc('linea', base)).toEqual({
      url: 'https://linea-mainnet.infura.io/v3/serverkey',
      headers: { Authorization: basic },
    })
  })

  it('sends no header without a secret', () => {
    const { RPC_API_KEY_SECRET: _, ...noSecret } = base
    expect(resolveServerRpc('base', noSecret)?.headers).toEqual({})
  })

  it('takes an override URL as is, without the provider header', () => {
    expect(
      resolveServerRpc('stellar', {
        ...base,
        RPC_URL_STELLAR: ' https://soroban.example.org ',
      })
    ).toEqual({ url: 'https://soroban.example.org', headers: {} })
  })

  it('authenticates an override with its own secret, never the provider one', () => {
    expect(
      resolveServerRpc('stellar', {
        ...base,
        RPC_URL_STELLAR: 'https://stellar-mainnet.infura.io/v3/otherkey',
        RPC_URL_STELLAR_SECRET: 'othersecret',
      })
    ).toEqual({
      url: 'https://stellar-mainnet.infura.io/v3/otherkey',
      headers: {
        Authorization: `Basic ${Buffer.from(':othersecret').toString('base64')}`,
      },
    })
  })

  it('builds dRPC URLs with the server key and no header', () => {
    expect(
      resolveServerRpc('celo', {
        NEXT_PUBLIC_RPC_PROVIDER: 'drpc',
        RPC_API_KEY: 'drpckey',
      })
    ).toEqual({ url: 'https://lb.drpc.live/celo/drpckey', headers: {} })
  })

  it('names the missing variable', () => {
    expect(() =>
      resolveServerRpc('linea', {
        ...base,
        NEXT_PUBLIC_RPC_PROVIDER: undefined,
      })
    ).toThrow(/NEXT_PUBLIC_RPC_PROVIDER/)
    expect(() =>
      resolveServerRpc('linea', { ...base, NEXT_PUBLIC_RPC_PROVIDER: 'nope' })
    ).toThrow(/NEXT_PUBLIC_RPC_PROVIDER/)
    expect(() =>
      resolveServerRpc('linea', { ...base, RPC_API_KEY: '' })
    ).toThrow(/RPC_API_KEY/)
  })

  it('needs no provider config when the network is overridden', () => {
    expect(
      resolveServerRpc('monad', { RPC_URL_MONAD: 'https://monad.example.org' })
    ).toEqual({ url: 'https://monad.example.org', headers: {} })
  })
})

describe('rpcOverrideVar', () => {
  it('upper-cases the slug', () => {
    expect(rpcOverrideVar('hyperevm')).toBe('RPC_URL_HYPEREVM')
  })
})

describe('importing the module', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('does not throw with every RPC env var unset', async () => {
    vi.resetModules()
    for (const name of [
      'NEXT_PUBLIC_RPC_PROVIDER',
      'NEXT_PUBLIC_RPC_API_KEY',
      'RPC_API_KEY',
      'RPC_API_KEY_SECRET',
    ]) {
      vi.stubEnv(name, '')
    }
    await expect(import('./rpc.server')).resolves.toBeDefined()
  })
})
