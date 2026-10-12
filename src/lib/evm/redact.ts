/**
 * Log-safe text of a failure reason. viem error messages embed the full RPC
 * URL, so the Infura API key segment is replaced before anything is logged.
 */
export function redactRpcSecrets(reason: unknown): string {
  const text = reason instanceof Error ? reason.message : String(reason)
  return text.replace(/(infura\.io\/v3\/)[^\s"'/?#]+/gi, '$1***')
}
