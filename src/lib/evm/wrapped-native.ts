import type { Address } from 'viem'

import type { TxChainId } from '@/config/chains'

/**
 * The token whose USD price values the native balance of each tx chain: its
 * wrapped version on the same chain (CELO is its own ERC-20). `null` = no
 * wrapped token in the products catalogue — the native stays unpriced.
 * Addresses checked against the catalogue on 2026-10-13. Typed on every tx
 * chain: a new chain does not compile until its native price is decided.
 */
export const NATIVE_PRICE_TOKEN: Record<TxChainId, Address | null> = {
  1: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  10: '0x4200000000000000000000000000000000000006',
  56: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
  130: '0x4200000000000000000000000000000000000006',
  137: '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270',
  143: null,
  324: '0x5aea5775959fbc2557cc8789bc1bf90a239d9a91',
  999: '0x5555555555555555555555555555555555555555',
  4326: '0x4200000000000000000000000000000000000006',
  5000: '0x78c1b0c915c4faa5fffa6cabf0219da63d7f4cb8',
  8453: '0x4200000000000000000000000000000000000006',
  42161: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
  42220: '0x471ece3750da237f93b8e339c536989b8978a438',
  43114: '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7',
  59144: '0xe5d7c2a44ffddf6b295a15c148167daaaf5cf34f',
  534352: '0x5300000000000000000000000000000000000004',
}

/**
 * ERC-20 views of a native balance. Reading the catalogue token as well as
 * the native would count the same funds twice: the token is not read.
 */
export const NATIVE_ERC20_ALIASES: Partial<Record<TxChainId, Address>> = {
  42220: '0x471ece3750da237f93b8e339c536989b8978a438',
}
