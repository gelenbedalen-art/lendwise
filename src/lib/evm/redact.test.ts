import { describe, expect, it, vi } from 'vitest'

import { redactRpcSecrets } from './redact'

describe('redactRpcSecrets', () => {
  it('hides the Infura key of an error message', () => {
    const out = redactRpcSecrets(
      new Error(
        'HTTP request failed.\nURL: https://linea-mainnet.infura.io/v3/abc123def\nStatus: 500'
      )
    )
    expect(out).toContain('infura.io/v3/***')
    expect(out).not.toContain('abc123def')
  })

  it('passes a non-Error through', () => {
    expect(redactRpcSecrets('db down')).toBe('db down')
  })

  it('hides every key in one message', () => {
    const out = redactRpcSecrets(
      new Error('a https://a.infura.io/v3/key1 b "https://b.infura.io/v3/key2"')
    )
    expect(out).not.toMatch(/key1|key2/)
    expect(out.match(/infura\.io\/v3\/\*\*\*/g)).toHaveLength(2)
  })

  it('masks the configured key, secret and Basic header wherever they appear', () => {
    const secret = 'serversecret'
    const basic = Buffer.from(`:${secret}`).toString('base64')
    const text = redactRpcSecrets(
      new Error(
        `failed https://rpc.example.org/k/serverkey ${secret} ${basic}`
      ),
      ['serverkey', secret]
    )
    expect(text).not.toMatch(/serverkey|serversecret/)
    expect(text).not.toContain(basic)
  })

  it('ignores empty or missing secrets', () => {
    expect(redactRpcSecrets('plain message', [undefined, ''])).toBe(
      'plain message'
    )
  })

  it('masks untrimmed env values by their trimmed form too', () => {
    const basic = Buffer.from(':serversecret').toString('base64')
    const text = redactRpcSecrets(
      new Error(`k serverkey s serversecret h ${basic}`),
      ['serverkey\n', ' serversecret ']
    )
    expect(text).not.toMatch(/serverkey|serversecret/)
    expect(text).not.toContain(basic)
  })

  it('masks the longest value first so no fragment of it remains', () => {
    const text = redactRpcSecrets('x abcd1234xyz y', [
      'abcd1234',
      'abcd1234xyz',
    ])
    expect(text).not.toMatch(/xyz|abcd/)
  })

  it('skips values shorter than 4 characters', () => {
    expect(redactRpcSecrets('a banana', ['a'])).toBe('a banana')
  })

  it('masks the RPC_URL_ override URLs of the environment', () => {
    vi.stubEnv('RPC_URL_MONAD', 'https://monad.example.org/abc12345key')
    const text = redactRpcSecrets(
      new Error('failed https://monad.example.org/abc12345key')
    )
    expect(text).not.toContain('abc12345key')
    vi.unstubAllEnvs()
  })
})
