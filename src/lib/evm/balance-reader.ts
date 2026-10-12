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
  /** Native balance per owner, in `owners` order. */
  native: bigint[]
  /** `tokens[i][j]` = balance of `owners[i]` in `tokens[j]`; null = that read failed. */
  tokens: (bigint | null)[][]
}

/** Calldata bytes per multicall chunk: about 50 `balanceOf` per `eth_call`. */
export const MULTICALL_CHUNK_BYTES = 8_192

type Pair = { owner: Address; token: Address }

async function readTokenBalances(
  client: BalanceClient,
  pairs: Pair[],
  multicall3: Address | null
): Promise<(bigint | null)[]> {
  if (pairs.length === 0) return []
  if (multicall3) {
    const results = await client.multicall({
      contracts: pairs.map(({ owner, token }) => ({
        address: token,
        abi: erc20Abi,
        functionName: 'balanceOf' as const,
        args: [owner] as const,
      })),
      allowFailure: true,
      multicallAddress: multicall3,
      batchSize: MULTICALL_CHUNK_BYTES,
    })
    return results.map((r) =>
      r.status === 'success' ? (r.result as bigint) : null
    )
  }
  return Promise.all(
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
  )
}

/**
 * Native and catalogue-token balances of every owner on one chain. A native
 * read that fails rejects the chain. A token read that fails is null, unless
 * every token read failed: that is the RPC, not a token, and the chain
 * rejects — multicall's `allowFailure` would otherwise show an empty wallet.
 */
export async function readChainBalances(
  client: BalanceClient,
  req: BalanceRequest
): Promise<ChainBalances> {
  const pairs = req.owners.flatMap((owner) =>
    req.tokens.map((token) => ({ owner, token }))
  )
  const [native, flat] = await Promise.all([
    Promise.all(req.owners.map((address) => client.getBalance({ address }))),
    readTokenBalances(client, pairs, req.multicall3),
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
