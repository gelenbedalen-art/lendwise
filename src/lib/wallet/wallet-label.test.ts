import { describe, expect, it } from 'vitest'

import { walletSubtitle } from './wallet-label'

describe('walletSubtitle', () => {
  it('names the EVM family, and says when there is no client', () => {
    expect(
      walletSubtitle({ chainFamily: 'evm', isConnected: true }, true)
    ).toBe('EVM')
    expect(
      walletSubtitle({ chainFamily: 'evm', isConnected: true }, false)
    ).toBe('EVM · Not connected')
  })

  it('keeps the Stellar labels', () => {
    expect(
      walletSubtitle({ chainFamily: 'stellar', isConnected: true }, false)
    ).toBe('Stellar')
    expect(
      walletSubtitle({ chainFamily: 'stellar', isConnected: false }, false)
    ).toBe('Stellar · Not signed in')
  })

  it('has no subtitle for other families', () => {
    expect(
      walletSubtitle({ chainFamily: 'bitcoin', isConnected: true }, false)
    ).toBeNull()
  })
})
