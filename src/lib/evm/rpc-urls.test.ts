import { describe, expect, it } from 'vitest'

import { holdingsRpcUrls } from './rpc-urls'

const INFURA = 'https://celo-mainnet.infura.io/v3/key'

describe('holdingsRpcUrls', () => {
  it('puts Infura first, then the chain public RPC', () => {
    expect(
      holdingsRpcUrls(INFURA, ['https://forno.celo.org', 'https://x'])
    ).toEqual([INFURA, 'https://forno.celo.org'])
  })

  it('keeps one URL when the public RPC is Infura itself', () => {
    expect(holdingsRpcUrls(INFURA, [INFURA])).toEqual([INFURA])
  })

  it('keeps one URL when the chain has no public RPC', () => {
    expect(holdingsRpcUrls(INFURA, [])).toEqual([INFURA])
  })
})
