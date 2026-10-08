import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getBasicTeamStats } from '../src/odds-engine/features/team-basic-stats.features';
import { matchHistoryProvider } from '../src/odds-engine/providers/match-history.provider';
import { BasicTeamStats } from '../src/odds-engine/features/team-basic-stats.types';

vi.mock('../src/odds-engine/providers/match-history.provider', () => ({
  matchHistoryProvider: {
    getTeamMatches: vi.fn(),
  },
}));

describe('getBasicTeamStats', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // Helper to create match records
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
      id,
      homeTeamId,
      awayTeamId,
      competitionId: 'c1',
      matchday,
      matchDate: new Date(matchDate),
      status,
      homeScore,
      awayScore,
      homeTeam: { id: homeTeamId, name: `Team ${homeTeamId}`, logoUrl: null },
      awayTeam: { id: awayTeamId, name: `Team ${awayTeamId}`, logoUrl: null },
      competition: { id: 'c1', name: 'Competition', logoUrl: null, active: true },
    };
  }

  describe('Test 1 — wins/draws/losses', () => {
    it('should calculate wins, draws, losses correctly', async () => {
      // Arrange
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamA', 'teamB', 3, 1), // WIN
        createMatch('m2', 'teamA', 'teamC', 2, 2), // DRAW
        createMatch('m3', 'teamA', 'teamD', 0, 2), // LOSS
      ]);

      // Act
      const result = await getBasicTeamStats('teamA');

      // Assert
      expect(result.matches).toBe(3);
      expect(result.wins).toBe(1);
      expect(result.draws).toBe(1);
      expect(result.losses).toBe(1);
      expect(result.points).toBe(4); // 3 + 1 + 0
    });
  });

  describe('Test 2 — goals', () => {
    it('should calculate goals statistics correctly', async () => {
      // Arrange
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamA', 'teamB', 3, 1), // GF:3, GA:1
        createMatch('m2', 'teamA', 'teamC', 0, 2), // GF:0, GA:2
        createMatch('m3', 'teamA', 'teamD', 2, 2), // GF:2, GA:2
      ]);

      // Act
      const result = await getBasicTeamStats('teamA');

      // Assert
      expect(result.goalsFor).toBe(5); // 3 + 0 + 2
      expect(result.goalsAgainst).toBe(5); // 1 + 2 + 2
      expect(result.goalDifference).toBe(0); // 5 - 5
      expect(result.goalsForPerMatch).toBeCloseTo(5 / 3);
      expect(result.goalsAgainstPerMatch).toBeCloseTo(5 / 3);
      expect(result.goalDifferencePerMatch).toBeCloseTo(0);
    });
  });

  describe('Test 3 — clean sheets', () => {
    it('should calculate clean sheets correctly', async () => {
      // Arrange
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamA', 'teamB', 2, 0), // Clean sheet
        createMatch('m2', 'teamA', 'teamC', 1, 0), // Clean sheet
        createMatch('m3', 'teamA', 'teamD', 2, 1), // Not clean sheet
      ]);

      // Act
      const result = await getBasicTeamStats('teamA');

      // Assert
      expect(result.cleanSheets).toBe(2);
      expect(result.cleanSheetRate).toBeCloseTo(2 / 3);
    });
  });

  describe('Test 4 — failed to score', () => {
    it('should calculate failed to score correctly', async () => {
      // Arrange
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamA', 'teamB', 0, 1), // Failed to score
        createMatch('m2', 'teamA', 'teamC', 0, 0), // Failed to score
        createMatch('m3', 'teamA', 'teamD', 2, 1), // Scored
      ]);

      // Act
      const result = await getBasicTeamStats('teamA');

      // Assert
      expect(result.failedToScore).toBe(2);
      expect(result.failedToScoreRate).toBeCloseTo(2 / 3);
    });
  });

  describe('Test 5 — BTTS', () => {
    it('should calculate BTTS correctly', async () => {
      // Arrange
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamA', 'teamB', 2, 1), // BTTS: YES
        createMatch('m2', 'teamA', 'teamC', 1, 1), // BTTS: YES
        createMatch('m3', 'teamA', 'teamD', 2, 0), // BTTS: NO
        createMatch('m4', 'teamA', 'teamE', 0, 2), // BTTS: NO
      ]);

      // Act
      const result = await getBasicTeamStats('teamA');

      // Assert
      expect(result.bttsYes).toBe(2);
      expect(result.bttsRate).toBeCloseTo(0.5);
    });
  });

  describe('Test 6 — Over 1.5 / 2.5 / 3.5', () => {
    it('should calculate over/under statistics correctly', async () => {
      // Arrange
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamA', 'teamB', 1, 0), // Total: 1 -> Over 1.5: No, Over 2.5: No, Over 3.5: No
        createMatch('m2', 'teamA', 'teamC', 1, 1), // Total: 2 -> Over 1.5: Yes, Over 2.5: No, Over 3.5: No
        createMatch('m3', 'teamA', 'teamD', 2, 1), // Total: 3 -> Over 1.5: Yes, Over 2.5: Yes, Over 3.5: No
        createMatch('m4', 'teamA', 'teamE', 2, 2), // Total: 4 -> Over 1.5: Yes, Over 2.5: Yes, Over 3.5: Yes
      ]);

      // Act
      const result = await getBasicTeamStats('teamA');

      // Assert
      expect(result.over15).toBe(3); // Matches 2, 3, 4
      expect(result.over15Rate).toBeCloseTo(3 / 4);
      expect(result.over25).toBe(2); // Matches 3, 4
      expect(result.over25Rate).toBeCloseTo(2 / 4);
      expect(result.over35).toBe(1); // Match 4
      expect(result.over35Rate).toBeCloseTo(1 / 4);
    });
  });

  describe('Test 7 — incomplete/non-finished matches', () => {
    it('should ignore non-eligible matches', async () => {
      // Arrange
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamA', 'teamB', 2, 1), // FINISHED - should count
        createMatch('m2', 'teamA', 'teamC', null, null, 'SCHEDULED'), // SCHEDULED - should ignore
        createMatch('m3', 'teamA', 'teamD', 1, 0, 'LIVE'), // LIVE - should ignore
        createMatch('m4', 'teamA', 'teamE', 3, 2, 'VOID'), // VOID - should ignore
        createMatch('m5', 'teamA', 'teamF', null, null, 'FINISHED'), // FINISHED but null scores - should ignore
      ]);

      // Act
      const result = await getBasicTeamStats('teamA');

      // Assert
      expect(result.matches).toBe(1); // Only m1
      expect(result.wins).toBe(1);
      expect(result.draws).toBe(0);
      expect(result.losses).toBe(0);
      expect(result.points).toBe(3);
    });
  });

  describe('Test 8 — away team', () => {
    it('should handle away team matches correctly', async () => {
      // Arrange
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        // Team B as away team: home Team A (1) vs away Team B (3) -> Team B wins 3-1
        createMatch('m1', 'teamA', 'teamB', 1, 3),
      ]);

      // Act
      const result = await getBasicTeamStats('teamB');

      // Assert
      expect(result.matches).toBe(1);
      expect(result.wins).toBe(1);
      expect(result.draws).toBe(0);
      expect(result.losses).toBe(0);
      expect(result.goalsFor).toBe(3); // Away team scored 3
      expect(result.goalsAgainst).toBe(1); // Away team conceded 1
      expect(result.points).toBe(3);
    });
  });

  describe('Test 9 — zero matches', () => {
    it('should return zeros for team with no eligible matches', async () => {
      // Arrange
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([]);

      // Act
      const result = await getBasicTeamStats('teamA');

      // Assert
      expect(result.matches).toBe(0);
      expect(result.wins).toBe(0);
      expect(result.draws).toBe(0);
      expect(result.losses).toBe(0);
      expect(result.points).toBe(0);
      expect(result.pointsPerMatch).toBe(0);
      expect(result.goalsFor).toBe(0);
      expect(result.goalsAgainst).toBe(0);
      expect(result.goalDifference).toBe(0);
      expect(result.goalsForPerMatch).toBe(0);
      expect(result.goalsAgainstPerMatch).toBe(0);
      expect(result.goalDifferencePerMatch).toBe(0);
      expect(result.cleanSheets).toBe(0);
      expect(result.cleanSheetRate).toBe(0);
      expect(result.failedToScore).toBe(0);
      expect(result.failedToScoreRate).toBe(0);
      expect(result.bttsYes).toBe(0);
      expect(result.bttsRate).toBe(0);
      expect(result.over15).toBe(0);
      expect(result.over15Rate).toBe(0);
      expect(result.over25).toBe(0);
      expect(result.over25Rate).toBe(0);
      expect(result.over35).toBe(0);
      expect(result.over35Rate).toBe(0);
    });
  });

  describe('Test 10 — team isolation', () => {
    it('should not include matches of other teams', async () => {
      // Arrange: mock getTeamMatches to only return teamA's match (provider isolates by team)
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamA', 'teamB', 2, 1),
      ]);

      // Act
      const result = await getBasicTeamStats('teamA');

      // Assert
      expect(result.matches).toBe(1); // Only teamA's match
      expect(result.wins).toBe(1);
      expect(result.draws).toBe(0);
      expect(result.losses).toBe(0);
      expect(result.goalsFor).toBe(2);
      expect(result.goalsAgainst).toBe(1);
    });
  });
});