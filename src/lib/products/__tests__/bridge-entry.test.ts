import { describe, expect, it } from 'vitest'

import { bridgeHref } from '@/lib/execution/cctp/deep-link'
import {
  bridgeActionFor,
  isStellarNetworkFiltered,
} from '@/lib/products/bridge-entry'

const STELLAR_USDC = {
  poolChainId: -1,
  network: 'stellar',
  assetSymbol: 'USDC',
  productId: 'blend:v2.1:stellar:pool:p:usdc:supply',
}

describe('bridgeActionFor', () => {
  it('sends a Stellar USDC row to the bridge with its product', () => {
    expect(bridgeActionFor(STELLAR_USDC)).toBe(
      bridgeHref({ productId: STELLAR_USDC.productId })
    )
  })

  it('sends an EVM USDC row on a CCTP source chain with its chain as source', () => {
    const href = bridgeActionFor({
      poolChainId: 8453,
      network: 'base',
      assetSymbol: 'USDC',
    })
    expect(href).toBe(bridgeHref({ sourceSlug: 'base' }))
    expect(href).toContain('source=base')
  })

  it('never falls back to a source for a network CCTP does not serve', () => {
    for (const network of ['lido', 'etherfi', 'horizon', 'polygon']) {
      const href = bridgeActionFor({
        poolChainId: 1,
        network,
        assetSymbol: 'USDC',
      })
      expect(href).not.toBeNull()
      expect(href).not.toContain('source=')
    }
  })

  it('offers nothing for an asset the bridge does not carry', () => {
    expect(
      bridgeActionFor({
        poolChainId: 1,
        network: 'ethereum',
        assetSymbol: 'WETH',
      })
    ).toBeNull()
    expect(
      bridgeActionFor({
        poolChainId: -1,
        network: 'stellar',
        assetSymbol: 'XLM',
      })
    ).toBeNull()
  })
})

describe('isStellarNetworkFiltered', () => {
  it('is true when the network filter includes Stellar', () => {
    expect(
      isStellarNetworkFiltered([{ id: 'network', value: ['stellar', 'base'] }])
    ).toBe(true)
    expect(
      isStellarNetworkFiltered([{ id: 'network', value: 'stellar' }])
    ).toBe(true)
  })

  it('is false otherwise', () => {
    expect(isStellarNetworkFiltered([])).toBe(false)
    expect(isStellarNetworkFiltered([{ id: 'network', value: ['base'] }])).toBe(
      false
    )
    expect(
      isStellarNetworkFiltered([{ id: 'assetSymbol', value: 'USDC' }])
    ).toBe(false)
  })
})
