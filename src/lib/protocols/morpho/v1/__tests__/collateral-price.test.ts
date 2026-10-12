import { describe, expect, it } from 'vitest'

import { collateralPriceInLoanAsset } from '../utils'

describe('collateralPriceInLoanAsset', () => {
  it('unscales the Morpho oracle price (1e36 · 10^(loan − collateral decimals))', () => {
    // WBTC (8) priced in USDC (6) at 60 000: 6e4 · 10^(36 + 6 − 8)
    expect(
      collateralPriceInLoanAsset(
        '600000000000000000000000000000000000000',
        6,
        8
      )
    ).toBeCloseTo(60_000, 6)
    // wstETH (18) in WETH (18) at 1.2
    expect(collateralPriceInLoanAsset(1.2e36, 18, 18)).toBeCloseTo(1.2, 12)
  })

  it('returns null without a price or a collateral asset', () => {
    expect(collateralPriceInLoanAsset(null, 6, 8)).toBeNull()
    expect(collateralPriceInLoanAsset('0', 6, 8)).toBeNull()
    expect(collateralPriceInLoanAsset('1', 6, null)).toBeNull()
  })

  it('returns null when the scaled result is not finite', () => {
    // 10^(36 + 6 − 500) underflows to 0, so the division overflows
    expect(collateralPriceInLoanAsset('1e30', 6, 500)).toBeNull()
  })
})
