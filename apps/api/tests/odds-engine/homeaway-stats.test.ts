import { describe, it, expect, vi } from 'vitest';
import { getTeamHomeAwayStats } from '../../src/odds-engine/features/team-home-away.features';
import { matchHistoryProvider } from '../../src/odds-engine/providers/match-history.provider';
import { NormalizedMatch } from '../../src/odds-engine/providers/match-history.types';

vi.mock('../../src/odds-engine/providers/match-history.provider', () => ({
  matchHistoryProvider: {
    getTeamMatches: vi.fn(),
    getCompetitionMatches: vi.fn(),
    getHeadToHead: vi.fn(),
    getRecentTeamMatches: vi.fn(),
  },
}));

describe('getTeamHomeAwayStats real', () => {
  it('valid + invalid mix => only valid count', async () => {
    const mockMatches: NormalizedMatch[] = [
      { matchId: 'm1', homeTeamId: 't1', awayTeamId: 't2', homeTeamName: 'H', awayTeamName: 'A', competitionId: 'c1', matchday: 1, matchDate: new Date('2025-06-05'), status: 'FINISHED', homeScore: 3, awayScore: 1 },
      { matchId: 'm2', homeTeamId: 't1', awayTeamId: 't2', homeTeamName: 'H', awayTeamName: 'A', competitionId: 'c1', matchday: 1, matchDate: new Date('2025-06-08'), status: 'FINISHED', homeScore: 1, awayScore: 2 },
      { matchId: 'm3', homeTeamId: 't1', awayTeamId: 't2', homeTeamName: 'H', awayTeamName: 'A', competitionId: 'c1', matchday: 1, matchDate: new Date('2025-06-09'), status: 'LIVE', homeScore: 1, awayScore: 0 },
      { matchId: 'm4', homeTeamId: 't2', awayTeamId: 't1', homeTeamName: 'H', awayTeamName: 'A', competitionId: 'c1', matchday: 1, matchDate: new Date('2025-06-10'), status: 'FINISHED', homeScore: 2, awayScore: 0 },
    ];
    vi.mocked(matchHistoryProvider.getTeamMatches).mockResolvedValue(mockMatches);
    const stats = await getTeamHomeAwayStats('t1', new Date('2025-06-15'));
    // Acasă: m1 (3-1 victorie), m2 (1-2 înfrângere) => 2 meciuri, 1 win, goalsFor 4, goalsAgainst 3
    expect(stats.home.matches).toBe(2);
    expect(stats.home.wins).toBe(1);
    expect(stats.home.goalsFor).toBe(4);
    expect(stats.home.goalsAgainst).toBe(3);
    // Deplasare: m4 (0-2 înfrângere pentru t1) => 1 meci, 0 wins
    expect(stats.away.matches).toBe(1);
    expect(stats.away.wins).toBe(0);
    expect(stats.away.goalsFor).toBe(0);
  });

  it('zero eligible => null rates and zero counts', async () => {
    vi.mocked(matchHistoryProvider.getTeamMatches).mockResolvedValue([]);
    const stats = await getTeamHomeAwayStats('t1', new Date('2025-06-15'));
    expect(stats.home.matches).toBe(0);
    expect(stats.home.pointsPerMatch).toBeNull();
    expect(stats.away.matches).toBe(0);
    expect(stats.away.cleanSheetRate).toBeNull();
  });
});
