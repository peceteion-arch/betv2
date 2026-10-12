import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getH2HStats } from '../src/odds-engine/features/h2h-stats.features';
import { matchHistoryProvider } from '../src/odds-engine/providers/match-history.provider';
import { H2HStats } from '../src/odds-engine/features/h2h-stats.types';

vi.mock('../src/odds-engine/providers/match-history.provider', () => ({
  matchHistoryProvider: {
    getHeadToHead: vi.fn(),
  },
}));

describe('getH2HStats', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // Helper to create NormalizedMatch records
  function createMatch(
    id: string,
    homeTeamId: string,
    awayTeamId: string,
    homeScore: number | null,
    awayScore: number | null,
    status: string = 'FINISHED',
    matchday: number = 1,
    matchDate: string = '2026-09-01T18:00:00Z'
  ) {
    return {
      matchId: id,
      homeTeamId,
      awayTeamId,
      homeTeamName: homeTeamId,
      awayTeamName: awayTeamId,
      competitionId: 'c1',
      matchday,
      matchDate: new Date(matchDate),
      status,
      homeScore,
      awayScore,
    };
  }

  // ... (Testele 1-20 rămân, le voi păstra pe cele relevante)

  it('should include correct score distribution in H2H stats', async () => {
    (matchHistoryProvider.getHeadToHead as any).mockResolvedValue([
      createMatch('m1', 'Ajax', 'Phoenix', 3, 1),
      createMatch('m2', 'Phoenix', 'Ajax', 2, 0),
    ]);

    const result = await getH2HStats('Ajax', 'Phoenix', new Date('2099-01-01T00:00:00Z'));

    expect(result.scoreDistribution.matchesTotal).toBe(2);
    expect(result.scoreDistribution.scorelines).toContainEqual({ goalsFor: 3, goalsAgainst: 1, count: 1, rate: 0.5 });
    expect(result.scoreDistribution.scorelines).toContainEqual({ goalsFor: 0, goalsAgainst: 2, count: 1, rate: 0.5 });
  });

  it('should exclude matches involving only one team from score distribution', async () => {
    (matchHistoryProvider.getHeadToHead as any).mockResolvedValue([
      createMatch('m1', 'Ajax', 'Phoenix', 3, 1),
      createMatch('m2', 'Ajax', 'Micasa', 2, 0),
    ]);

    const result = await getH2HStats('Ajax', 'Phoenix', new Date('2099-01-01T00:00:00Z'));

    expect(result.scoreDistribution.matchesTotal).toBe(1);
    expect(result.scoreDistribution.scorelines[0]).toEqual({ goalsFor: 3, goalsAgainst: 1, count: 1, rate: 1 });
  });
});
