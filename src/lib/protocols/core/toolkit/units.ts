/**
 * Convert a whole-token amount to an integer string of raw base units
 * (amount × 10^decimals), rounded to the nearest unit. Never uses exponent
 * notation. Non-finite or negative input yields '0'.
 */
export function toBaseUnits(amount: number, decimals: number): string {
  if (!Number.isFinite(amount) || amount < 0) return '0'
  const scaled = Math.round(amount * 10 ** decimals)
  if (!Number.isFinite(scaled)) return '0'
  return BigInt(scaled).toString()
}
