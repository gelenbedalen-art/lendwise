import type { Kind } from '@/lib/db/types'
import {
  CHAIN_SLUG_MAP,
  type RegisteredChainId,
} from '@/lib/protocols/core/toolkit'

// ─── Product ID builder ───────────────────────────────────────────────────────
// Unified Morpho productId — same single-builder shape as aave/compound:
//   morpho:v1:{chain}:{vault|market}:{address}:{supply|borrow}
// productType is implied by kind (supply ⇒ vault, borrow ⇒ market); `address`
// is the vault address for supply and the marketId for borrow.
// Replaces the legacy split prefixes (metamorpho:…/morphoblue:…) that omitted
// the trailing kind segment and forced special-case parsing.
export function buildProductId(
  chainId: number,
  address: string,
  kind: Kind
): string {
  const network = CHAIN_SLUG_MAP[chainId as RegisteredChainId]
  if (!network)
    throw new Error(
      `No slug registered for chainId ${chainId} — add it to chain-slugs.ts`
    )
  const productType = kind === 'supply' ? 'vault' : 'market'
  return `morpho:v1:${network}:${productType}:${address.toLowerCase()}:${kind}`
}

/**
 * A Morpho market's oracle price of one collateral token, in loan tokens.
 * `MarketState.price` is scaled by 10^(36 + loanDecimals − collateralDecimals).
 */
export function collateralPriceInLoanAsset(
  price: unknown,
  loanDecimals: number,
  collateralDecimals: number | null | undefined
): number | null {
  if (price == null || collateralDecimals == null) return null
  const raw = Number(price)
  if (!Number.isFinite(raw) || raw <= 0) return null
  const result = raw / 10 ** (36 + loanDecimals - collateralDecimals)
  return Number.isFinite(result) ? result : null
}
