/**
 * Log-safe text of a failure reason. viem error messages embed the full RPC
 * URL, so the Infura API key segment is replaced first. Then every configured
 * secret (by default the server RPC key and its secret) is masked, as is its
 * Basic-auth form, wherever it appears — whatever the provider's URL shape.
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
  for (const secret of secrets) {
    if (!secret) continue
    const basic = Buffer.from(`:${secret}`).toString('base64')
    for (const value of [secret, basic]) text = text.split(value).join('***')
  }
  return text
}
