/** `chainId:lowercase address` — the key of the holdings price map. */
export function holdingPriceKey(chainId: number, address: string): string {
  return `${chainId}:${address.toLowerCase()}`
}
