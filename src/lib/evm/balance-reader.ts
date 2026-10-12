import { type Address, type PublicClient, erc20Abi } from 'viem'

/** The RPC calls the reader makes — a viem public client has them. */
export type BalanceClient = Pick<
  PublicClient,
  'getBalance' | 'multicall' | 'readContract'
>

export interface BalanceRequest {
  owners: Address[]
  tokens: Address[]
  /** multicall3 of the chain; null = one `balanceOf` call per pair. */
  multicall3: Address | null
}

export interface ChainBalances {
  /** Native balance per owner, in `owners` order; null = that read failed. */
  native: (bigint | null)[]
  /** `tokens[i][j]` = balance of `owners[i]` in `tokens[j]`; null = that read failed. */
  tokens: (bigint | null)[][]
}

/** Calldata bytes per multicall chunk: about 220 `balanceOf` per `eth_call`. */
export const MULTICALL_CHUNK_BYTES = 8_192

/** multicall3's native balance view — not in viem's multicall3Abi. */
const getEthBalanceAbi = [
  {
    type: 'function',
    name: 'getEthBalance',
    stateMutability: 'view',
    inputs: [{ name: 'addr', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
] as const

/**
 * One multicall per chain: for each owner, `getEthBalance` then every
 * `balanceOf`. A failed call is null; if every call failed that is the RPC,
 * not the wallet, and the chain rejects.
 */
async function readWithMulticall(
  client: BalanceClient,
  req: BalanceRequest,
  multicall3: Address
): Promise<ChainBalances> {
  const contracts = req.owners.flatMap((owner) => [
    {
      address: multicall3,
      abi: getEthBalanceAbi,
      functionName: 'getEthBalance' as const,
      args: [owner] as const,
    },
    ...req.tokens.map((token) => ({
      address: token,
      abi: erc20Abi,
      functionName: 'balanceOf' as const,
      args: [owner] as const,
    })),
  ])
  if (contracts.length === 0) return { native: [], tokens: [] }
  const results = await client.multicall({
    contracts,
    allowFailure: true,
    multicallAddress: multicall3,
    batchSize: MULTICALL_CHUNK_BYTES,
  })
  if (results.every((r) => r.status !== 'success')) {
    throw new Error(`every multicall call failed (${results.length} calls)`)
  }
  const values = results.map((r) =>
    r.status === 'success' ? (r.result as bigint) : null
  )
  const stride = req.tokens.length + 1
  return {
    native: req.owners.map((_, i) => values[i * stride]),
    tokens: req.owners.map((_, i) =>
      values.slice(i * stride + 1, (i + 1) * stride)
    ),
  }
}

/** Without multicall3: `getBalance` per owner, `balanceOf` per pair. */
async function readOneByOne(
  client: BalanceClient,
  req: BalanceRequest
): Promise<ChainBalances> {
  const pairs = req.owners.flatMap((owner) =>
    req.tokens.map((token) => ({ owner, token }))
  )
  const [native, flat] = await Promise.all([
    Promise.all(req.owners.map((address) => client.getBalance({ address }))),
    Promise.all(
      pairs.map(({ owner, token }) =>
        client
          .readContract({
            address: token,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [owner],
          })
          .then(
            (balance) => balance as bigint,
            () => null
          )
      )
    ),
  ])
  if (pairs.length > 0 && flat.every((b) => b === null)) {
    throw new Error(`every balanceOf failed (${pairs.length} calls)`)
  }
  const width = req.tokens.length
  return {
    native,
    tokens: req.owners.map((_, i) => flat.slice(i * width, (i + 1) * width)),
  }
}

/**
 * Native and catalogue-token balances of every owner on one chain. With
 * multicall3 the natives (`getEthBalance`) and the tokens share one
 * multicall, so a chain costs one `eth_call` per chunk: a failed call is
 * null, and the chain rejects only when every call failed. Without it, a
 * native read that fails rejects the chain, a failed `balanceOf` is null,
 * and the chain rejects when every `balanceOf` failed — the RPC, not a
 * token — since it would otherwise show an empty wallet.
 */
export async function readChainBalances(
  client: BalanceClient,
  req: BalanceRequest
): Promise<ChainBalances> {
  return req.multicall3
    ? readWithMulticall(client, req, req.multicall3)
    : readOneByOne(client, req)
}
