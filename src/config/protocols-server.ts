// src/config/protocols-server.ts — server only: loaders dynamic-import heavy adapter modules
import type { ProtocolName } from '@/config/protocols-meta'
import type {
  AppAdapter,
  StellarPositionsAdapter,
  YieldAdapter,
} from '@/lib/protocols/core/types'
import { fixtureAddress } from '@/lib/protocols/stellar/fixture/config'

export const YIELD_ADAPTERS: Record<ProtocolName, () => Promise<YieldAdapter>> =
  {
    aave_v3: () => import('@/lib/protocols/aave/v3').then((m) => m.adapter),
    morpho_v1: () => import('@/lib/protocols/morpho/v1').then((m) => m.adapter),
    compound_v3: () =>
      import('@/lib/protocols/compound/v3').then((m) => m.adapter),
    'blend_v2.1': () =>
      import('@/lib/protocols/blend/v2_1').then((m) => m.adapter),
  }

export const APP_ADAPTERS: Partial<
  Record<ProtocolName, () => Promise<AppAdapter>>
> = {
  aave_v3: () => import('@/lib/protocols/aave/v3').then((m) => m.appAdapter),
  morpho_v1: () =>
    import('@/lib/protocols/morpho/v1').then((m) => m.appAdapter),
  compound_v3: () =>
    import('@/lib/protocols/compound/v3').then((m) => m.appAdapter),
}

/**
 * Stellar position sources, read for `G…` addresses only. A function, not a
 * constant: the staging fixture is enabled per environment, at call time.
 */
export function stellarPositionAdapters(
  env: Record<string, string | undefined> = process.env
): Record<string, () => Promise<StellarPositionsAdapter>> {
  const adapters: Record<string, () => Promise<StellarPositionsAdapter>> = {
    'blend_v2.1': () =>
      import('@/lib/protocols/blend/v2_1/positions').then(
        (m) => m.positionsAdapter
      ),
  }
  const fixture = fixtureAddress(env)
  if (fixture) {
    adapters.stellar_fixture = () =>
      import('@/lib/protocols/stellar/fixture').then((m) =>
        m.createStellarFixtureAdapter(fixture)
      )
  }
  return adapters
}
