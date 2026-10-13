/**
 * RPC URLs a wallet read tries, in order. Infura serves some networks (Celo,
 * zkSync) to our key with a lower limit and answers 429; the chain's own
 * public RPC takes over then. Skipped when it is Infura itself (the custom
 * chains) or missing.
 */
export function holdingsRpcUrls(
  infura: string,
  publicDefaults: readonly string[]
): string[] {
  const fallbackUrl = publicDefaults[0]
  return fallbackUrl && fallbackUrl !== infura
    ? [infura, fallbackUrl]
    : [infura]
}
