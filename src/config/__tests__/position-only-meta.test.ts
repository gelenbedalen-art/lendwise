import { describe, expect, it } from 'vitest'

import {
  PROTOCOLS_META,
  isProtocolName,
  protocolVersionName,
} from '@/config/protocols-meta'

describe('position-only protocols', () => {
  it('names the Stellar fixture without registering it', () => {
    expect(protocolVersionName('stellar_fixture')).toBe('Stellar fixture')
    expect('stellar_fixture' in PROTOCOLS_META).toBe(false)
  })

  it('tells registered protocols apart', () => {
    expect(isProtocolName('blend_v2.1')).toBe(true)
    expect(isProtocolName('stellar_fixture')).toBe(false)
    expect(isProtocolName('blend_v1')).toBe(false)
  })
})
