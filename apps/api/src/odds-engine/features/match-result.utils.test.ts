import { describe, it, expect } from 'vitest';
import { getTeamMatchResult } from './match-result.utils';

const m = (homeScore: number | null, awayScore: number | null) => ({
  homeTeamId: 'A',
  awayTeamId: 'B',
  homeScore,
  awayScore,
});

describe('getTeamMatchResult', () => {
  it('victorie vazuta din ambele perspective', () => {
    const a = getTeamMatchResult(m(3, 1), 'A')!;
    expect(a).toMatchObject({ opponentId: 'B', goalsFor: 3, goalsAgainst: 1, goalDifference: 2, outcome: 'WIN', points: 3 });
    const b = getTeamMatchResult(m(3, 1), 'B')!;
    expect(b).toMatchObject({ opponentId: 'A', goalsFor: 1, goalsAgainst: 3, goalDifference: -2, outcome: 'LOSS', points: 0 });
  });

  it('egal -> 1 punct pentru ambele', () => {
    expect(getTeamMatchResult(m(2, 2), 'A')!.points).toBe(1);
    expect(getTeamMatchResult(m(2, 2), 'B')!.outcome).toBe('DRAW');
  });

  it('0-0 este rezultat valid (nu lipsa scorului)', () => {
    expect(getTeamMatchResult(m(0, 0), 'A')!.outcome).toBe('DRAW');
  });

  it('null daca lipsesc scorurile', () => {
    expect(getTeamMatchResult(m(null, 1), 'A')).toBeNull();
    expect(getTeamMatchResult(m(1, null), 'B')).toBeNull();
  });

  it('null daca echipa nu joaca in meci', () => {
    expect(getTeamMatchResult(m(1, 0), 'C')).toBeNull();
  });

  it('null daca echipa joaca cu ea insasi', () => {
    expect(getTeamMatchResult({ homeTeamId: 'A', awayTeamId: 'A', homeScore: 1, awayScore: 0 }, 'A')).toBeNull();
  });
});
