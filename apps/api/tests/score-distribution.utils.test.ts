import { describe, it, expect } from 'vitest';
import { calculateScoreDistribution } from '../src/odds-engine/features/score-distribution.utils';

describe('calculateScoreDistribution', () => {
  it('should handle an empty list', () => {
    const result = calculateScoreDistribution([]);
    expect(result.matchesTotal).toBe(0);
    expect(result.scorelines).toEqual([]);
  });

  it('should aggregate correctly', () => {
    const matches = [
      { goalsFor: 2, goalsAgainst: 1 },
      { goalsFor: 2, goalsAgainst: 1 },
      { goalsFor: 0, goalsAgainst: 0 },
    ];
    const result = calculateScoreDistribution(matches);
    expect(result.matchesTotal).toBe(3);
    expect(result.scorelines).toContainEqual({ goalsFor: 2, goalsAgainst: 1, count: 2, rate: 2 / 3 });
    expect(result.scorelines).toContainEqual({ goalsFor: 0, goalsAgainst: 0, count: 1, rate: 1 / 3 });
  });

  it('should exclude invalid matches', () => {
    const matches = [
      { goalsFor: 2, goalsAgainst: 1 },
      { goalsFor: -1, goalsAgainst: 0 }, // invalid
      { goalsFor: NaN, goalsAgainst: 1 }, // invalid
      { goalsFor: 1, goalsAgainst: Infinity }, // invalid
    ];
    const result = calculateScoreDistribution(matches);
    expect(result.matchesTotal).toBe(1);
    expect(result.scorelines).toEqual([{ goalsFor: 2, goalsAgainst: 1, count: 1, rate: 1 }]);
  });

  it('should maintain invariant sum(count) === matchesTotal', () => {
    const matches = [{ goalsFor: 1, goalsAgainst: 0 }, { goalsFor: 0, goalsAgainst: 1 }];
    const result = calculateScoreDistribution(matches);
    const sumCount = result.scorelines.reduce((acc, s) => acc + s.count, 0);
    expect(sumCount).toBe(result.matchesTotal);
  });
});
