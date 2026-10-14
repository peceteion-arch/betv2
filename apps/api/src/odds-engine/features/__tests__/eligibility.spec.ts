import { describe, it, expect, vi } from 'vitest';
import { getBasicTeamStats } from '../team-basic-stats.features';
import { getTeamFormStats } from '../team-form.features';
import { getTeamHomeAwayStats } from '../team-home-away.features';
import { matchHistoryProvider } from '../../providers/match-history.provider';
import { NormalizedMatch } from '../../providers/match-history.types';

// Mock isolate: provider mock, nu DB reală
vi.mock('../../providers/match-history.provider', () => ({
  matchHistoryProvider: {
    getTeamMatches: vi.fn(),
    getCompetitionMatches: vi.fn(),
    getHeadToHead: vi.fn(),
    getRecentTeamMatches: vi.fn(),
  },
}));

describe('Eligibility integration — real methods', () => {
  it('getBasicTeamStats excludes non-FINISHED and invalid scores', async () => {
    const mockMatches: NormalizedMatch[] = [
      { matchId: 'm1', homeTeamId: 't1', awayTeamId: 't2', homeTeamName: 'H', awayTeamName: 'A', competitionId: 'c1', matchday: 1, matchDate: new Date('2025-06-10'), status: 'FINISHED', homeScore: 2, awayScore: 1 },
      { matchId: 'm2', homeTeamId: 't1', awayTeamId: 't2', homeTeamName: 'H', awayTeamName: 'A', competitionId: 'c1', matchday: 1, matchDate: new Date('2025-06-10'), status: 'LIVE', homeScore: 1, awayScore: 0 },
      { matchId: 'm3', homeTeamId: 't1', awayTeamId: 't2', homeTeamName: 'H', awayTeamName: 'A', competitionId: 'c1', matchday: 1, matchDate: new Date('2025-06-10'), status: 'FINISHED', homeScore: null, awayScore: 1 },
      { matchId: 'm4', homeTeamId: 't1', awayTeamId: 't2', homeTeamName: 'H', awayTeamName: 'A', competitionId: 'c1', matchday: 1, matchDate: new Date('2025-06-10'), status: 'FINISHED', homeScore: -1, awayScore: 2 },
      { matchId: 'm5', homeTeamId: 't1', awayTeamId: 't2', homeTeamName: 'H', awayTeamName: 'A', competitionId: 'c1', matchday: 1, matchDate: new Date('2025-06-10'), status: 'FINISHED', homeScore: 1.5, awayScore: 2 },
    ];
    vi.mocked(matchHistoryProvider.getTeamMatches).mockResolvedValue(mockMatches);
    const stats = await getBasicTeamStats('t1', new Date('2025-06-15'));
    expect(stats.matches).toBe(1); // doar m1 eligibil
    expect(stats.wins).toBe(1);
    expect(stats.goalsFor).toBe(2);
  });

  it('getBasicTeamStats respects asOf strict', async () => {
    const mockMatches: NormalizedMatch[] = [
      { matchId: 'm1', homeTeamId: 't1', awayTeamId: 't2', homeTeamName: 'H', awayTeamName: 'A', competitionId: 'c1', matchday: 1, matchDate: new Date('2025-06-14'), status: 'FINISHED', homeScore: 1, awayScore: 0 },
      { matchId: 'm2', homeTeamId: 't1', awayTeamId: 't2', homeTeamName: 'H', awayTeamName: 'A', competitionId: 'c1', matchday: 1, matchDate: new Date('2025-06-15'), status: 'FINISHED', homeScore: 3, awayScore: 1 },
    ];
    vi.mocked(matchHistoryProvider.getTeamMatches).mockResolvedValue(mockMatches);
    const stats = await getBasicTeamStats('t1', new Date('2025-06-15'));
    expect(stats.matches).toBe(1); // m2 exclude pentru == asOf
  });

  it('getTeamFormStats excludes invalid and respects limit', async () => {
    const mockMatches: NormalizedMatch[] = [
      { matchId: 'm1', homeTeamId: 't1', awayTeamId: 't2', homeTeamName: 'H', awayTeamName: 'A', competitionId: 'c1', matchday: 1, matchDate: new Date('2025-06-01'), status: 'FINISHED', homeScore: 2, awayScore: 1 },
      { matchId: 'm2', homeTeamId: 't1', awayTeamId: 't2', homeTeamName: 'H', awayTeamName: 'A', competitionId: 'c1', matchday: 1, matchDate: new Date('2025-06-05'), status: 'FINISHED', homeScore: 1, awayScore: 1 },
      { matchId: 'm3', homeTeamId: 't1', awayTeamId: 't2', homeTeamName: 'H', awayTeamName: 'A', competitionId: 'c1', matchday: 1, matchDate: new Date('2025-06-10'), status: 'SCHEDULED', homeScore: null, awayScore: null },
    ];
    vi.mocked(matchHistoryProvider.getTeamMatches).mockResolvedValue(mockMatches);
    const form = await getTeamFormStats('t1', new Date('2025-06-20'));
    expect(form.last3.matches).toBe(2);
  });

  it('getTeamHomeAwayStats zero eligible => null rates', async () => {
    vi.mocked(matchHistoryProvider.getTeamMatches).mockResolvedValue([]);
    const stats = await getTeamHomeAwayStats('t1', new Date('2025-06-15'));
    expect(stats.home.matches).toBe(0);
    expect(stats.home.pointsPerMatch).toBeNull();
  });
});
