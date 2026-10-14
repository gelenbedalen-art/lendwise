import { describe, expect, it, vi } from 'vitest'

import { EVENT_RETENTION_LEDGERS, oldestEventLedger } from '../api'

describe('oldestEventLedger', () => {
  it('takes the oldest ledger from getHealth when the RPC has it', async () => {
    const server = {
      getHealth: vi.fn(async () => ({
        oldestLedger: 1_000,
        latestLedger: 2_000,
      })),
      getLatestLedger: vi.fn(),
    }
    expect(await oldestEventLedger(server as never)).toBe(1_000)
    expect(server.getLatestLedger).not.toHaveBeenCalled()
  })

  it('falls back to the retention window when getHealth is missing', async () => {
    const server = {
      getHealth: vi.fn(async () => {
        throw new Error('the method getHealth does not exist/is not available')
      }),
      getLatestLedger: vi.fn(async () => ({ sequence: 64_930_066 })),
    }
    const oldest = await oldestEventLedger(server as never)
    expect(oldest).toBeGreaterThan(64_930_066 - EVENT_RETENTION_LEDGERS)
    expect(oldest).toBeLessThan(64_930_066)
  })

  it('fails when neither call works', async () => {
    const server = {
      getHealth: vi.fn(async () => {
        throw new Error('down')
      }),
      getLatestLedger: vi.fn(async () => {
        throw new Error('down too')
      }),
    }
    await expect(oldestEventLedger(server as never)).rejects.toThrow('down too')
  })
})
