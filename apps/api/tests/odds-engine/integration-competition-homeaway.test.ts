import { describe, it, expect } from 'vitest';
import { isMatchEligible } from '../../src/odds-engine/features/match-eligibility.utils';
import { NormalizedMatch } from '../../src/odds-engine/providers/match-history.types';

function m(overrides = {}): NormalizedMatch {
  return {
    matchId: 'm1', homeTeamId: 't1', awayTeamId: 't2',
    homeTeamName: 'H', awayTeamName: 'A', competitionId: 'c1',
    matchday: 1, matchDate: new Date('2025-06-10'), status: 'FINISHED',
    homeScore: 2, awayScore: 1, ...overrides,
  } as NormalizedMatch;
}

describe('Integration checks (2C)', () => {
  const asOf = new Date('2025-06-15');

  it('getCompetitionMatches contract: excludes LIVE, negative, fraction, NaN, missing, ==asOf', () => {
    expect(isMatchEligible(m({ status: 'LIVE' }), asOf)).toBe(false);
    expect(isMatchEligible(m({ homeScore: -1 }), asOf)).toBe(false);
    expect(isMatchEligible(m({ homeScore: 1.5 }), asOf)).toBe(false);
    expect(isMatchEligible(m({ homeScore: NaN }), asOf)).toBe(false);
    expect(isMatchEligible(m({ homeScore: Infinity }), asOf)).toBe(false);
    expect(isMatchEligible(m({ homeScore: null }), asOf)).toBe(false);
    expect(isMatchEligible(m({ matchDate: asOf }), asOf)).toBe(false);
  });

  it('getTeamHomeAwayStats contract: eligible only', () => {
    expect(isMatchEligible(m({ matchDate: new Date('2025-06-14') }), asOf)).toBe(true);
    expect(isMatchEligible(m({ matchDate: new Date('2025-06-15') }), asOf)).toBe(false);
  });
});
