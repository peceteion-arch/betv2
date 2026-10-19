import { describe, it, expect } from 'vitest';
import { isMatchEligible } from '../match-eligibility.utils';
import { NormalizedMatch } from '../../providers/match-history.types';

function makeMatch(overrides: Partial<NormalizedMatch> = {}): NormalizedMatch {
  return {
    matchId: 'm1',
    homeTeamId: 't1',
    awayTeamId: 't2',
    homeTeamName: 'Home',
    awayTeamName: 'Away',
    competitionId: 'c1',
    matchday: 1,
    matchDate: new Date('2025-06-15'),
    status: 'FINISHED',
    homeScore: 2,
    awayScore: 1,
    ...overrides,
  } as NormalizedMatch;
}

describe('isMatchEligible common rule', () => {
  const asOf = new Date('2025-06-20');

  it('FINISHED with valid scores -> eligible', () => {
    expect(isMatchEligible(makeMatch(), asOf)).toBe(true);
  });

  it('SCHEDULED -> not eligible', () => {
    expect(isMatchEligible(makeMatch({ status: 'SCHEDULED' }), asOf)).toBe(false);
  });

  it('LIVE -> not eligible', () => {
    expect(isMatchEligible(makeMatch({ status: 'LIVE' }), asOf)).toBe(false);
  });

  it('homeScore null -> not eligible', () => {
    expect(isMatchEligible(makeMatch({ homeScore: null }), asOf)).toBe(false);
  });

  it('awayScore null -> not eligible', () => {
    expect(isMatchEligible(makeMatch({ awayScore: null }), asOf)).toBe(false);
  });

  it('negative home score -> not eligible', () => {
    expect(isMatchEligible(makeMatch({ homeScore: -1 }), asOf)).toBe(false);
  });

  it('fractional score -> not eligible', () => {
    expect(isMatchEligible(makeMatch({ homeScore: 2.5 }), asOf)).toBe(false);
  });

  it('non-finite score (Infinity) -> not eligible', () => {
    expect(isMatchEligible(makeMatch({ homeScore: Infinity }), asOf)).toBe(false);
  });

  it('invalid matchDate -> not eligible', () => {
    expect(isMatchEligible(makeMatch({ matchDate: new Date('invalid') }), asOf)).toBe(false);
  });

  it('matchDate before asOf -> eligible', () => {
    expect(isMatchEligible(makeMatch({ matchDate: new Date('2025-06-10') }), asOf)).toBe(true);
  });

  it('matchDate equal asOf -> not eligible', () => {
    expect(isMatchEligible(makeMatch({ matchDate: new Date('2025-06-20') }), asOf)).toBe(false);
  });

  it('matchDate after asOf -> not eligible', () => {
    expect(isMatchEligible(makeMatch({ matchDate: new Date('2025-06-25') }), asOf)).toBe(false);
  });

  it('zero score is eligible (not treated as missing)', () => {
    expect(isMatchEligible(makeMatch({ homeScore: 0, awayScore: 0 }), asOf)).toBe(true);
  });

  it('FORFEIT match is NOT eligible even with valid FINISHED status and scores', () => {
    // Matches awarded/forfeited must not influence statistical ratings.
    expect(isMatchEligible(makeMatch({ status: 'FINISHED', homeScore: 3, awayScore: 0, isForfeit: true }), asOf)).toBe(false);
  });

  it('regular FINISHED match with same score is eligible', () => {
    // Same scoreline as a forfeit, but not marked as forfeit -> should be eligible.
    expect(isMatchEligible(makeMatch({ status: 'FINISHED', homeScore: 3, awayScore: 0, isForfeit: false }), asOf)).toBe(true);
  });

  it('forfeit defaults to false when omitted', () => {
    // Backwards compatibility: old matches without isForfeit field should remain eligible.
    const match = makeMatch({ status: 'FINISHED', homeScore: 2, awayScore: 1 });
    // isForfeit is not set -> defaults to false in the interface
    expect(match.isForfeit).toBeUndefined();
    expect(isMatchEligible(match, asOf)).toBe(true);
  });
});
