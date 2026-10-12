import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTeamFormStats } from '../src/odds-engine/features/team-form.features';
import { matchHistoryProvider } from '../src/odds-engine/providers/match-history.provider';
import { NormalizedMatch } from '../src/odds-engine/providers/match-history.types';

vi.mock('../src/odds-engine/providers/match-history.provider', () => ({
  matchHistoryProvider: {
    getTeamMatches: vi.fn(),
  },
}));

describe('getTeamFormStats', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // Helper to create a NormalizedMatch
  function createMatch(
    matchId: string,
    homeTeamId: string,
    awayTeamId: string,
    homeScore: number | null,
    awayScore: number | null,
    status: string = 'FINISHED',
    matchDate: string = '2026-09-01T18:00:00Z',
    matchday: number = 1
  ): NormalizedMatch {
    return {
      matchId,
      homeTeamId,
      awayTeamId,
      homeTeamName: `Team ${homeTeamId}`,
      awayTeamName: `Team ${awayTeamId}`,
      competitionId: 'c1',
      matchday,
      matchDate: new Date(matchDate),
      status,
      homeScore,
      awayScore,
    };
  }

  describe('Eligibility tests', () => {
    it('should ignore non-eligible matches (SCHEDULED, LIVE, VOID, null scores)', async () => {
      // Arrange
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamA', 'teamB', 1, 0, 'FINISHED', '2026-09-01T18:00:00Z'), // Eligible
        createMatch('m2', 'teamA', 'teamC', 1, 1, 'SCHEDULED', '2026-09-02T18:00:00Z'), // Non-eligible
        createMatch('m3', 'teamA', 'teamD', 2, 1, 'LIVE', '2026-09-03T18:00:00Z'), // Non-eligible
        createMatch('m4', 'teamA', 'teamE', 3, 0, 'VOID', '2026-09-04T18:00:00Z'), // Non-eligible
        createMatch('m5', 'teamA', 'teamF', null, 1, 'FINISHED', '2026-09-05T18:00:00Z'), // Non-eligible (null score)
      ]);

      // Act
      const result = await getTeamFormStats('teamA', new Date('2099-01-01T00:00:00Z'));

      // Assert
      expect(result.last3.matches).toBe(1);
      expect(result.last3.goalsFor).toBe(1);
    });

    it('should exclude matches on or after asOf', async () => {
      const asOf = new Date('2026-09-05T12:00:00Z');
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamA', 'teamB', 2, 1, 'FINISHED', '2026-09-04T12:00:00Z'), // Eligible
        createMatch('m2', 'teamA', 'teamC', 2, 1, 'FINISHED', '2026-09-05T12:00:00Z'), // On asOf (exclude)
        createMatch('m3', 'teamA', 'teamD', 2, 1, 'FINISHED', '2026-09-06T12:00:00Z'), // Future (exclude)
      ]);

      const result = await getTeamFormStats('teamA', asOf);
      expect(result.last3.matches).toBe(1);
      expect(result.last3.goalsFor).toBe(2);
    });
  });

  describe('Calculation safety', () => {
    it('should produce null for rates when matches are 0', async () => {
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([]);
      const result = await getTeamFormStats('teamA', new Date('2099-01-01T00:00:00Z'));

      expect(result.last3.pointsPerMatch).toBe(null);
      expect(result.last3.goalsForPerMatch).toBe(null);
      expect(result.last3.cleanSheetRate).toBe(null);
    });
  });

  // Keep existing tests...
  describe('Test 1 — last3', () => {
    it('should use only the last 3 matches chronologically', async () => {
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamA', 'teamB', 1, 0, 'FINISHED', '2026-09-01T18:00:00Z'),
        createMatch('m2', 'teamA', 'teamC', 1, 0, 'FINISHED', '2026-09-02T18:00:00Z'),
        createMatch('m3', 'teamA', 'teamD', 1, 0, 'FINISHED', '2026-09-03T18:00:00Z'),
        createMatch('m4', 'teamA', 'teamE', 1, 0, 'FINISHED', '2026-09-04T18:00:00Z'),
        createMatch('m5', 'teamA', 'teamF', 1, 0, 'FINISHED', '2026-09-05T18:00:00Z'),
      ]);

      const result = await getTeamFormStats('teamA', new Date('2099-01-01T00:00:00Z'));

      expect(result.last3.matches).toBe(3);
      expect(result.last3.goalsFor).toBe(3);
      expect(result.last3.goalsAgainst).toBe(0);
      expect(result.last3.wins).toBe(3);
    });
  });
});
