/** Values shorter than this are not masked: they would star out the whole log line. */
const MIN_SECRET_LENGTH = 4

/**
 * Log-safe text of a failure reason. viem error messages embed the full RPC
 * URL, so the Infura API key segment is replaced first. Then every configured
 * secret (by default the server RPC key and its secret) is masked, raw and
 * trimmed, along with the Basic-auth form of each, wherever it appears —
 * whatever the provider's URL shape. Longer values are masked first so a
 * shorter one never leaves a fragment of a longer one. Secrets shorter than
 * 4 characters once trimmed are ignored.
 */
export function redactRpcSecrets(
  reason: unknown,
  secrets: (string | undefined)[] = [
    process.env.RPC_API_KEY,
    process.env.RPC_API_KEY_SECRET,
  ]
): string {
  const message = reason instanceof Error ? reason.message : String(reason)
  let text = message.replace(/(infura\.io\/v3\/)[^\s"'/?#]+/gi, '$1***')

  const values = new Set<string>()
  for (const secret of secrets) {
    if (!secret || secret.trim().length < MIN_SECRET_LENGTH) continue
    for (const value of [secret, secret.trim()]) {
      values.add(value)
      values.add(Buffer.from(`:${value}`).toString('base64'))
    }
  }
  for (const value of [...values].sort((a, b) => b.length - a.length)) {
    text = text.split(value).join('***')
  }
  return text
}
