/**
 * What counts as "test data" left behind by tests/e2e-settlement.ts.
 * Pure functions, no DB access, so they can be unit-tested and reviewed.
 * Be strict: anything that does not match EXACTLY is treated as real data.
 */

export function isTestUserEmail(email: string): boolean {
  return email.toLowerCase().endsWith('@t.com');
}

/**
 * e2e fixtures:
 *   t-*  makeMatch()        H vs A
 *   f-*  makeFutureMatch()  H vs A
 *   r-*  section 10         H vs A and H2 vs A2
 * All use league 'L' and country 'Manual'.
 */
export function isTestMatch(m: {
  homeTeam: string;
  awayTeam: string;
  league: string;
  externalId: string;
}): boolean {
  if (m.league !== 'L') return false;
  if (!/^[tfr]-/.test(m.externalId)) return false;
  const teams = `${m.homeTeam}|${m.awayTeam}`;
  return teams === 'H|A' || teams === 'H2|A2';
}
