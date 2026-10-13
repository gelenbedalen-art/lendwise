import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'

import { isRpcRefusal, sanitizeRpcError } from '../api'

function httpError() {
  return Object.assign(new Error('Request failed with status code 429'), {
    config: {
      url: 'https://stellar-mainnet.infura.io/v3/serverkey123',
      headers: { authorization: 'Basic OlNFUlZFUg==' },
    },
    response: { status: 429, data: 'x' },
  })
}

describe('sanitizeRpcError', () => {
  it('keeps the message and the status, drops the request', () => {
    const result = sanitizeRpcError(httpError())
    expect(result.message).toBe('Request failed with status code 429')
    expect(isRpcRefusal(result)).toBe(true)
    expect(result).not.toHaveProperty('config')
    const printed = inspect(result, { depth: 5 })
    expect(printed).not.toContain('serverkey123')
    expect(printed).not.toContain('OlNFUlZFUg==')
  })

  it('passes a plain error through with its message and no response', () => {
    const result = sanitizeRpcError(new Error('boom'))
    expect(result.message).toBe('boom')
    expect(result).not.toHaveProperty('response')
  })

  it('redacts a secret in the message itself', () => {
    const result = sanitizeRpcError(
      new Error('failed https://stellar-mainnet.infura.io/v3/serverkey123')
    )
    expect(result.message).not.toContain('serverkey123')
  })
})
