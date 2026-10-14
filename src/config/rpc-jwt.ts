import { type KeyObject, createPrivateKey, sign } from 'node:crypto'

/** Lifetime of a signed RPC token. */
export const RPC_JWT_TTL_SECONDS = 3_600

/** `iat` backdated by this much, in case the provider's clock runs behind ours. */
const CLOCK_SKEW_SECONDS = 30

/** A cached token is replaced once less than this remains. */
const REFRESH_BEFORE_SECONDS = 300

export interface RpcJwtConfig {
  /** PEM of an EC P-256 (ES256) or RSA (RS256) private key. */
  privateKeyPem: string
  /** The fingerprint dRPC shows for the uploaded public key. */
  keyId: string
}

const b64url = (value: string | Buffer) =>
  Buffer.from(value).toString('base64url')

/** A PEM pasted into an env var often arrives with literal `\n`. */
export function normalizePem(pem: string): string {
  return pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem
}

function algorithmOf(key: KeyObject): 'ES256' | 'RS256' {
  if (
    key.asymmetricKeyType === 'ec' &&
    key.asymmetricKeyDetails?.namedCurve === 'prime256v1'
  ) {
    return 'ES256'
  }
  if (key.asymmetricKeyType === 'rsa') return 'RS256'
  throw new Error(
    'RPC_JWT_PRIVATE_KEY must be an EC P-256 (ES256) or RSA (RS256) private key'
  )
}

/**
 * A JWT the RPC provider (dRPC) verifies with the public key uploaded to it:
 * `kid` names that key, the signature proves the request comes from our
 * server even if the API key leaked.
 */
export function signRpcJwt(config: RpcJwtConfig, nowSeconds: number): string {
  let key: KeyObject
  try {
    key = createPrivateKey(normalizePem(config.privateKeyPem))
  } catch {
    // No `cause`: the parser's error must never carry key material along.
    throw new Error('RPC_JWT_PRIVATE_KEY is not a valid PEM private key')
  }
  const alg = algorithmOf(key)
  const header = b64url(JSON.stringify({ alg, typ: 'JWT', kid: config.keyId }))
  const payload = b64url(
    JSON.stringify({
      iat: nowSeconds - CLOCK_SKEW_SECONDS,
      exp: nowSeconds + RPC_JWT_TTL_SECONDS,
    })
  )
  const data = `${header}.${payload}`
  const signature = sign(
    'sha256',
    Buffer.from(data),
    alg === 'ES256' ? { key, dsaEncoding: 'ieee-p1363' } : key
  )
  return `${data}.${b64url(signature)}`
}

/** Signs once, then reuses the token until it nears expiry or the key changes. */
export function cachedRpcJwt(
  now: () => number = () => Math.floor(Date.now() / 1000)
): (config: RpcJwtConfig) => string {
  let cached: { token: string; exp: number; config: string } | undefined
  return (config) => {
    const t = now()
    const id = `${config.keyId}\u0000${config.privateKeyPem}`
    if (
      cached &&
      cached.config === id &&
      cached.exp - t > REFRESH_BEFORE_SECONDS
    ) {
      return cached.token
    }
    const token = signRpcJwt(config, t)
    cached = { token, exp: t + RPC_JWT_TTL_SECONDS, config: id }
    return token
  }
}
