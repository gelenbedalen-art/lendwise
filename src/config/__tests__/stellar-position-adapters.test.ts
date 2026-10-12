import { describe, expect, it } from 'vitest'

import { stellarPositionAdapters } from '@/config/protocols-server'

const G = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'

describe('stellarPositionAdapters', () => {
  it('registers Blend v2.1 only by default', () => {
    expect(Object.keys(stellarPositionAdapters({}))).toEqual(['blend_v2.1'])
  })

  it('adds the fixture on a preview with an address', () => {
    expect(
      Object.keys(
        stellarPositionAdapters({
          VERCEL_ENV: 'preview',
          STELLAR_RISK_FIXTURE_ADDRESS: G,
        })
      )
    ).toEqual(['blend_v2.1', 'stellar_fixture'])
  })

  it('never adds it in production', () => {
    expect(
      Object.keys(
        stellarPositionAdapters({
          VERCEL_ENV: 'production',
          STELLAR_RISK_FIXTURE_ADDRESS: G,
        })
      )
    ).toEqual(['blend_v2.1'])
  })
})
