import { describe, expect, it } from 'vitest'

import type { StellarSession, Wallet } from '@/stores/walletStore'

import {
  isDisplayableActive,
  ownsStellarSession,
  restoredStellarWalletUpdate,
} from './stellar-wallets'

const session = (address: string): StellarSession => ({
  address,
  networkPassphrase: 'Public Global Stellar Network ; September 2015',
  issuedAt: 1,
  expiresAt: 2,
})

const wallet = (overrides: Partial<Wallet> = {}): Wallet => ({
  address: 'GAAA',
  name: 'w',
  ens: null,
  walletType: null,
  smartContractWalletType: null,
  isActive: true,
  isConnected: true,
  isCurrentlyConnected: true,
  chainFamily: 'stellar',
  avatarUri: '',
  roles: [],
  isUpdating: false,
  ...overrides,
})

describe('restoredStellarWalletUpdate', () => {
  it('restores a sessionless wallet as inactive and disconnected', () => {
    const s = session('GBBB')
    expect(restoredStellarWalletUpdate(wallet({ address: 'GAAA' }), s)).toEqual(
      {
        isConnected: false,
        isCurrentlyConnected: false,
        isActive: false,
        stellarSession: undefined,
      }
    )
    expect(restoredStellarWalletUpdate(wallet(), null)).toMatchObject({
      isConnected: false,
      isActive: false,
    })
  })

  it('keeps the wallet that owns the session', () => {
    const s = session('GAAA')
    expect(restoredStellarWalletUpdate(wallet({ isActive: true }), s)).toEqual({
      isConnected: true,
      isCurrentlyConnected: true,
      stellarSession: s,
    })
    expect(
      restoredStellarWalletUpdate(wallet({ isActive: false }), s)
    ).toMatchObject({ isCurrentlyConnected: false, isConnected: true })
  })
})

describe('isDisplayableActive', () => {
  it('excludes sessionless Stellar wallets but keeps EVM', () => {
    expect(isDisplayableActive(wallet({ isConnected: false }))).toBe(false)
    expect(isDisplayableActive(wallet({ isConnected: true }))).toBe(true)
    expect(
      isDisplayableActive(wallet({ chainFamily: 'evm', isConnected: false }))
    ).toBe(true)
  })
})

describe('ownsStellarSession', () => {
  it('is true only for a matching session address', () => {
    expect(
      ownsStellarSession(wallet({ stellarSession: session('GAAA') }))
    ).toBe(true)
    expect(
      ownsStellarSession(wallet({ stellarSession: session('GBBB') }))
    ).toBe(false)
    expect(ownsStellarSession(wallet({ stellarSession: undefined }))).toBe(
      false
    )
    expect(ownsStellarSession(undefined)).toBe(false)
  })
})
