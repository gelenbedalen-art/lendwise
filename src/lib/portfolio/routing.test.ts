import { describe, expect, it } from 'vitest'

import { routePortfolioWallets } from './routing'
import { MAX_PORTFOLIO_WALLETS } from './types'

const G = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'
const EVM = '0x52908400098527886E0F7030069857D2E4169EE7'

describe('routePortfolioWallets', () => {
  it('never hands a Stellar address to EVM, nor the reverse', () => {
    const routed = routePortfolioWallets([
      { address: G, chainFamily: 'stellar' },
      { address: EVM, chainFamily: 'evm' },
      { address: G, chainFamily: 'evm' },
      { address: EVM, chainFamily: 'stellar' },
    ])
    expect(routed).toEqual({ evmAddresses: [EVM], stellarAddresses: [G] })
  })

  it('reads one EVM address once whatever its case', () => {
    const routed = routePortfolioWallets([
      { address: EVM.toLowerCase(), chainFamily: 'evm' },
      { address: EVM, chainFamily: 'evm' },
    ])
    expect(routed.evmAddresses).toHaveLength(1)
  })

  it('drops malformed addresses', () => {
    expect(
      routePortfolioWallets([
        { address: 'GNOTAKEY', chainFamily: 'stellar' },
        { address: '0x123', chainFamily: 'evm' },
      ])
    ).toEqual({ evmAddresses: [], stellarAddresses: [] })
  })

  it(`caps the input at ${MAX_PORTFOLIO_WALLETS} wallets`, () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      address: `0x${(i + 1).toString(16).padStart(40, '0')}`,
      chainFamily: 'evm' as const,
    }))
    expect(routePortfolioWallets(many).evmAddresses).toHaveLength(
      MAX_PORTFOLIO_WALLETS
    )
  })
})
