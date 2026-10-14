import { generateKeyPairSync, verify } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  RPC_JWT_TTL_SECONDS,
  cachedRpcJwt,
  normalizePem,
  signRpcJwt,
} from './rpc-jwt'

const pem = (curve: 'prime256v1' | 'secp384r1' | 'rsa') => {
  const pair =
    curve === 'rsa'
      ? generateKeyPairSync('rsa', { modulusLength: 2048 })
      : generateKeyPairSync('ec', { namedCurve: curve })
  return {
    privateKeyPem: pair.privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString(),
    publicKey: pair.publicKey,
  }
}

const decode = (part: string) =>
  JSON.parse(Buffer.from(part, 'base64url').toString())

describe('signRpcJwt', () => {
  it('signs ES256 with the key id, a lifetime, and a verifiable signature', () => {
    const { privateKeyPem, publicKey } = pem('prime256v1')
    const token = signRpcJwt({ privateKeyPem, keyId: 'FINGERPRINT' }, 1_000)
    const [h, p, s] = token.split('.')
    expect(decode(h)).toEqual({ alg: 'ES256', typ: 'JWT', kid: 'FINGERPRINT' })
    expect(decode(p)).toEqual({ iat: 1_000, exp: 1_000 + RPC_JWT_TTL_SECONDS })
    expect(
      verify(
        'sha256',
        Buffer.from(`${h}.${p}`),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(s, 'base64url')
      )
    ).toBe(true)
  })

  it('signs RS256 with an RSA key', () => {
    const { privateKeyPem, publicKey } = pem('rsa')
    const [h, p, s] = signRpcJwt({ privateKeyPem, keyId: 'K' }, 1).split('.')
    expect(decode(h).alg).toBe('RS256')
    expect(
      verify(
        'sha256',
        Buffer.from(`${h}.${p}`),
        publicKey,
        Buffer.from(s, 'base64url')
      )
    ).toBe(true)
  })

  it('refuses an EC key that is not P-256', () => {
    const { privateKeyPem } = pem('secp384r1')
    expect(() => signRpcJwt({ privateKeyPem, keyId: 'K' }, 1)).toThrow(
      /RPC_JWT_PRIVATE_KEY/
    )
  })
})

describe('normalizePem', () => {
  it('restores newlines pasted as literal \\n', () => {
    expect(normalizePem('-----BEGIN-----\\nabc\\n-----END-----')).toBe(
      '-----BEGIN-----\nabc\n-----END-----'
    )
  })
})

describe('cachedRpcJwt', () => {
  it('reuses a token until it nears expiry, then signs a new one', () => {
    const { privateKeyPem } = pem('prime256v1')
    let now = 1_000
    const jwt = cachedRpcJwt(() => now)
    const config = { privateKeyPem, keyId: 'K' }
    const first = jwt(config)
    now += RPC_JWT_TTL_SECONDS - 301
    expect(jwt(config)).toBe(first)
    now += 2
    expect(jwt(config)).not.toBe(first)
  })

  it('signs a new token when the key changes', () => {
    const jwt = cachedRpcJwt(() => 1)
    const a = jwt({
      privateKeyPem: pem('prime256v1').privateKeyPem,
      keyId: 'A',
    })
    const b = jwt({
      privateKeyPem: pem('prime256v1').privateKeyPem,
      keyId: 'B',
    })
    expect(decode(b.split('.')[0]).kid).toBe('B')
    expect(a).not.toBe(b)
  })
})
