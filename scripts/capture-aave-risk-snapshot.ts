/**
 * Freezes one Aave v3 account (outside e-mode) into the fixture the health
 * factor module is validated against: collateral amounts and liquidation
 * thresholds, debts, oracle USD prices, and the health factor Aave reports.
 *
 *   pnpm exec tsx scripts/capture-aave-risk-snapshot.ts <user> [chainId] [market]
 *
 * Defaults: chainId 1, market 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2 (Aave v3 Ethereum Core).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const AAVE_API = 'https://api.v3.aave.com/graphql'

async function gql<T>(query: string, variables: Record<string, unknown>) {
  const res = await fetch(AAVE_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const body = (await res.json()) as {
    data?: T
    errors?: { message: string }[]
  }
  if (!res.ok || body.errors?.length || !body.data) {
    throw new Error(`Aave API ${res.status}: ${JSON.stringify(body.errors)}`)
  }
  return body.data
}

const STATE = `query ($request: UserMarketStateRequest!) {
  userMarketState(request: $request) { healthFactor eModeEnabled }
}`
const SUPPLIES = `query ($request: UserSuppliesRequest!) {
  userSupplies(request: $request) {
    isCollateral
    currency { address symbol }
    balance { amount { value } usdPerToken }
  }
}`
const BORROWS = `query ($request: UserBorrowsRequest!) {
  userBorrows(request: $request) {
    currency { address symbol }
    debt { amount { value } usdPerToken }
  }
}`
const MARKET = `query ($request: MarketRequest!) {
  market(request: $request) {
    reserves {
      underlyingToken { address }
      supplyInfo { liquidationThreshold { value } }
    }
  }
}`

async function main() {
  const [user, chainArg, marketArg] = process.argv.slice(2)
  if (!user)
    throw new Error(
      'usage: capture-aave-risk-snapshot <user> [chainId] [market]'
    )
  const chainId = Number(chainArg ?? 1)
  const market = marketArg ?? '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2'
  const markets = [{ address: market, chainId }]

  const { userMarketState } = await gql<{
    userMarketState: { healthFactor: string | null; eModeEnabled: boolean }
  }>(STATE, { request: { user, chainId, market } })
  if (userMarketState.eModeEnabled)
    throw new Error('account is in e-mode — pick another')
  if (userMarketState.healthFactor == null)
    throw new Error('account has no debt')

  const { userSupplies } = await gql<{
    userSupplies: {
      isCollateral: boolean
      currency: { address: string; symbol: string }
      balance: { amount: { value: string }; usdPerToken: string }
    }[]
  }>(SUPPLIES, {
    request: { user, markets, collateralsOnly: true, orderBy: { apy: 'DESC' } },
  })
  const { userBorrows } = await gql<{
    userBorrows: {
      currency: { address: string; symbol: string }
      debt: { amount: { value: string }; usdPerToken: string }
    }[]
  }>(BORROWS, { request: { user, markets, orderBy: { apy: 'DESC' } } })
  const { market: reserves } = await gql<{
    market: {
      reserves: {
        underlyingToken: { address: string }
        supplyInfo: { liquidationThreshold: { value: string } }
      }[]
    }
  }>(MARKET, { request: { address: market, chainId } })

  const threshold = new Map(
    reserves.reserves.map(
      (r) =>
        [
          r.underlyingToken.address.toLowerCase(),
          Number(r.supplyInfo.liquidationThreshold.value),
        ] as const
    )
  )

  const collaterals = userSupplies
    .filter((s) => s.isCollateral)
    .map((s) => {
      const lt = threshold.get(s.currency.address.toLowerCase())
      if (lt == null || !(lt > 0 && lt < 1)) {
        throw new Error(`liquidation threshold for ${s.currency.symbol}: ${lt}`)
      }
      return {
        symbol: s.currency.symbol,
        address: s.currency.address,
        amount: Number(s.balance.amount.value),
        usdPerToken: Number(s.balance.usdPerToken),
        liquidationThreshold: lt,
      }
    })
  const debts = userBorrows.map((b) => ({
    symbol: b.currency.symbol,
    address: b.currency.address,
    amount: Number(b.debt.amount.value),
    usdPerToken: Number(b.debt.usdPerToken),
  }))

  const out = path.join('src/lib/risk/__tests__/fixtures/aave-snapshot.json')
  mkdirSync(path.dirname(out), { recursive: true })
  writeFileSync(
    out,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        chainId,
        market,
        user,
        reportedHealthFactor: Number(userMarketState.healthFactor),
        collaterals,
        debts,
      },
      null,
      2
    ) + '\n'
  )
  console.log(`wrote ${out}: HF ${userMarketState.healthFactor}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
