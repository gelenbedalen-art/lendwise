import type { Address } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import {
  type BalanceClient,
  MULTICALL_CHUNK_BYTES,
  readChainBalances,
} from './balance-reader'

const A = '0x00000000000000000000000000000000000000a1' as Address
const B = '0x00000000000000000000000000000000000000b2' as Address
const T1 = '0x0000000000000000000000000000000000000001' as Address
const T2 = '0x0000000000000000000000000000000000000002' as Address
const MC = '0xca11bde05977b3631167028862be2a173976ca11' as Address

function client(over: Record<string, unknown> = {}) {
  const c = {
    getBalance: vi.fn(async ({ address }: { address: Address }) =>
      address === A ? 10n : 20n
    ),
    multicall: vi.fn(),
    readContract: vi.fn(),
    ...over,
  }
  return c as typeof c & BalanceClient
}

describe('readChainBalances', () => {
  it('reads natives and tokens in one multicall when the chain has multicall3', async () => {
    const c = client({
      multicall: vi.fn(async () => [
        { status: 'success', result: 10n },
        { status: 'success', result: 1n },
        { status: 'failure', error: new Error('revert') },
        { status: 'failure', error: new Error('no native') },
        { status: 'success', result: 3n },
        { status: 'success', result: 0n },
      ]),
    })
    const r = await readChainBalances(c, {
      owners: [A, B],
      tokens: [T1, T2],
      multicall3: MC,
    })
    expect(r).toEqual({
      native: [10n, null],
      tokens: [
        [1n, null],
        [3n, 0n],
      ],
    })
    expect(c.multicall).toHaveBeenCalledTimes(1)
    const args = c.multicall.mock.calls[0][0]
    expect(args.multicallAddress).toBe(MC)
    expect(args.allowFailure).toBe(true)
    expect(args.batchSize).toBe(MULTICALL_CHUNK_BYTES)
    expect(
      args.contracts.map(
        (x: { functionName: string; address: Address; args: Address[] }) => [
          x.functionName,
          x.address,
          x.args[0],
        ]
      )
    ).toEqual([
      ['getEthBalance', MC, A],
      ['balanceOf', T1, A],
      ['balanceOf', T2, A],
      ['getEthBalance', MC, B],
      ['balanceOf', T1, B],
      ['balanceOf', T2, B],
    ])
    expect(c.getBalance).not.toHaveBeenCalled()
    expect(c.readContract).not.toHaveBeenCalled()
  })

  it('reads each balanceOf on its own without multicall3', async () => {
    const c = client({
      readContract: vi.fn(
        async ({ address, args }: { address: Address; args: Address[] }) => {
          if (address === T2 && args[0] === A) throw new Error('revert')
          return 5n
        }
      ),
    })
    const r = await readChainBalances(c, {
      owners: [A, B],
      tokens: [T1, T2],
      multicall3: null,
    })
    expect(r.tokens).toEqual([
      [5n, null],
      [5n, 5n],
    ])
    expect(c.readContract).toHaveBeenCalledTimes(4)
    expect(c.multicall).not.toHaveBeenCalled()
  })

  it('fails the chain when every multicall call failed', async () => {
    const fail = { status: 'failure', error: new Error('rpc down') }
    const c = client({ multicall: vi.fn(async () => [fail, fail, fail]) })
    await expect(
      readChainBalances(c, { owners: [A], tokens: [T1, T2], multicall3: MC })
    ).rejects.toThrow(/every multicall call failed \(3 calls\)/)
  })

  it('fails the chain when a multicall chunk failed', async () => {
    const ok = { status: 'success', result: 1n }
    const chunk = {
      status: 'failure',
      error: { functionName: 'aggregate3' },
    }
    const c = client({ multicall: vi.fn(async () => [ok, ok, chunk, chunk]) })
    await expect(
      readChainBalances(c, { owners: [A, B], tokens: [T1], multicall3: MC })
    ).rejects.toThrow(/multicall chunk failed/)
  })

  it('keeps a single reverted call as null', async () => {
    const ok = { status: 'success', result: 1n }
    const revert = {
      status: 'failure',
      error: { functionName: 'balanceOf' },
    }
    const c = client({ multicall: vi.fn(async () => [ok, ok, ok, revert]) })
    const r = await readChainBalances(c, {
      owners: [A, B],
      tokens: [T1],
      multicall3: MC,
    })
    expect(r.tokens).toEqual([[1n], [null]])
  })

  it('fails the chain when every token read failed without multicall3', async () => {
    const c = client({
      readContract: vi.fn(async () => {
        throw new Error('rpc down')
      }),
    })
    await expect(
      readChainBalances(c, { owners: [A], tokens: [T1, T2], multicall3: null })
    ).rejects.toThrow(/every balanceOf failed/)
  })

  it('fails the chain when a native read fails without multicall3', async () => {
    const c = client({
      getBalance: vi.fn(async () => {
        throw new Error('rpc down')
      }),
      readContract: vi.fn(async () => 1n),
    })
    await expect(
      readChainBalances(c, { owners: [A], tokens: [T1], multicall3: null })
    ).rejects.toThrow('rpc down')
  })

  it('reads only natives, in one multicall, when there is no catalogue token', async () => {
    const c = client({
      multicall: vi.fn(async () => [
        { status: 'success', result: 10n },
        { status: 'success', result: 20n },
      ]),
    })
    const r = await readChainBalances(c, {
      owners: [A, B],
      tokens: [],
      multicall3: MC,
    })
    expect(r).toEqual({ native: [10n, 20n], tokens: [[], []] })
    expect(c.multicall).toHaveBeenCalledTimes(1)
    expect(
      c.multicall.mock.calls[0][0].contracts.map(
        (x: { functionName: string; args: Address[] }) => [
          x.functionName,
          x.args[0],
        ]
      )
    ).toEqual([
      ['getEthBalance', A],
      ['getEthBalance', B],
    ])
    expect(c.getBalance).not.toHaveBeenCalled()
  })

  it('reads only natives with getBalance when there is no multicall3 and no token', async () => {
    const c = client()
    const r = await readChainBalances(c, {
      owners: [A, B],
      tokens: [],
      multicall3: null,
    })
    expect(r).toEqual({ native: [10n, 20n], tokens: [[], []] })
    expect(c.multicall).not.toHaveBeenCalled()
  })
})
