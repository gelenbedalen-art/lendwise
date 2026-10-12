/**
 * Freezes the borrow positions of one address on Morpho, with each market's
 * oracle price and the health factor Morpho reports, for the cross-check test.
 *
 *   pnpm exec tsx scripts/capture-morpho-risk-snapshot.ts <user> [chainId=1]
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const MORPHO_API = 'https://api.morpho.org/graphql'
const QUERY = `query ($where: MarketPositionFilters) {
  marketPositions(where: $where, first: 100) {
    items {
      healthFactor
      user { address }
      market {
        marketId
        lltv
        collateralAsset { symbol decimals }
        loanAsset { symbol decimals }
        morphoBlue { chain { id } }
        state { price }
      }
      state { collateral borrowAssets }
    }
  }
}`

async function main() {
  const [user, chainArg] = process.argv.slice(2)
  if (!user)
    throw new Error('usage: capture-morpho-risk-snapshot <user> [chainId]')
  const res = await fetch(MORPHO_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: QUERY,
      variables: {
        where: { userAddress_in: [user], chainId_in: [Number(chainArg ?? 1)] },
      },
    }),
  })
  const body = (await res.json()) as {
    data?: {
      marketPositions: {
        items: {
          healthFactor: number | null
          state: { borrowAssets: string } | null
        }[]
      }
    }
    errors?: unknown
  }
  if (!body.data) throw new Error(`Morpho API: ${JSON.stringify(body.errors)}`)
  const items = body.data.marketPositions.items.filter(
    (i) => i.healthFactor != null && Number(i.state?.borrowAssets ?? 0) > 0
  )
  if (items.length === 0)
    throw new Error('no Morpho borrow position for this address')

  const out =
    'src/lib/protocols/morpho/v1/__tests__/fixtures/morpho-snapshot.json'
  mkdirSync(path.dirname(out), { recursive: true })
  writeFileSync(
    out,
    JSON.stringify({ capturedAt: new Date().toISOString(), items }, null, 2) +
      '\n'
  )
  console.log(`wrote ${out}: ${items.length} position(s)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
