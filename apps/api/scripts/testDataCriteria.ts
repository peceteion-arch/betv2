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
 * Since league and country columns are removed, we identify test matches by:
 *   - externalId prefix t-, f-, r-
 *   - competition name being exactly 'L'
 *   - team names being exactly H vs A or H2 vs A2
 */
export function isTestMatch(m: {
  externalId: string;
  competition: { name: string };
  homeTeam: { name: string };
  awayTeam: { name: string };
}): boolean {
  if (!/^[tfr]-/.test(m.externalId)) return false;
  if (m.competition.name !== 'L') return false;
  const teams = `${m.homeTeam.name}|${m.awayTeam.name}`;
  return teams === 'H|A' || teams === 'H2|A2';
}