import { describe, it, expect, vi } from 'vitest';
import { getTeamFormStats } from '../../src/odds-engine/features/team-form.features';
import { matchHistoryProvider } from '../../src/odds-engine/providers/match-history.provider';
import { NormalizedMatch } from '../../src/odds-engine/providers/match-history.types';

vi.mock('../../src/odds-engine/providers/match-history.provider', () => ({
  matchHistoryProvider: {
    getTeamMatches: vi.fn(),
  },
}));

describe('getTeamFormStats calculated results', () => {
  it('sequence win-draw-loss produces correct rates', async () => {
    const mockMatches: NormalizedMatch[] = [
      { matchId: 'm1', homeTeamId: 't1', awayTeamId: 't2', homeTeamName: 'H', awayTeamName: 'A', competitionId: 'c1', matchday: 1, matchDate: new Date('2025-06-01'), status: 'FINISHED', homeScore: 2, awayScore: 0 },
      { matchId: 'm2', homeTeamId: 't1', awayTeamId: 't2', homeTeamName: 'H', awayTeamName: 'A', competitionId: 'c1', matchday: 1, matchDate: new Date('2025-06-02'), status: 'FINISHED', homeScore: 1, awayScore: 1 },
      { matchId: 'm3', homeTeamId: 't1', awayTeamId: 't2', homeTeamName: 'H', awayTeamName: 'A', competitionId: 'c1', matchday: 1, matchDate: new Date('2025-06-03'), status: 'FINISHED', homeScore: 0, awayScore: 3 },
    ];
    vi.mocked(matchHistoryProvider.getTeamMatches).mockResolvedValue(mockMatches);
    const form = await getTeamFormStats('t1', new Date('2025-06-10'));
    expect(form.last3.matches).toBe(3);
    expect(form.last3.wins).toBe(1);
    expect(form.last3.draws).toBe(1);
    expect(form.last3.losses).toBe(1);
    expect(form.last3.points).toBe(4); // 3+1+0
    expect(form.last3.pointsPerMatch).toBeCloseTo(4/3);
    expect(form.last3.goalsFor).toBe(3); // 2+1+0
    expect(form.last3.goalsAgainst).toBe(4); // 0+1+3
  });
});
