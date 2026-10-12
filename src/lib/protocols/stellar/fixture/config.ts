/**
 * The staging fixture's address, or null when the fixture is off. Never on in
 * production, whatever the variable says.
 */
export function fixtureAddress(
  env: Record<string, string | undefined> = process.env
): string | null {
  if (env.VERCEL_ENV === 'production') return null
  return env.STELLAR_RISK_FIXTURE_ADDRESS?.trim() || null
}
