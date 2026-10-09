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

  describe('Test 1 — last3', () => {
    it('should use only the last 3 matches chronologically', async () => {
      // Arrange (oldest to newest): m1, m2, m3, m4, m5
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamA', 'teamB', 1, 0, 'FINISHED', '2026-09-01T18:00:00Z'),
        createMatch('m2', 'teamA', 'teamC', 1, 0, 'FINISHED', '2026-09-02T18:00:00Z'),
        createMatch('m3', 'teamA', 'teamD', 1, 0, 'FINISHED', '2026-09-03T18:00:00Z'), // expected in last3
        createMatch('m4', 'teamA', 'teamE', 1, 0, 'FINISHED', '2026-09-04T18:00:00Z'), // expected in last3
        createMatch('m5', 'teamA', 'teamF', 1, 0, 'FINISHED', '2026-09-05T18:00:00Z'), // expected in last3
      ]);

      // Act
      const result = await getTeamFormStats('teamA', new Date('2099-01-01T00:00:00Z'));

      // Assert
      expect(result.last3.matches).toBe(3);
      // Since teamA is home and all home teams scored 1 and conceded 0:
      // each match in last3 has GF:1, GA:0.
      expect(result.last3.goalsFor).toBe(3);
      expect(result.last3.goalsAgainst).toBe(0);
      expect(result.last3.wins).toBe(3);
    });
  });

  describe('Test 2 — last5', () => {
    it('should use only the last 5 matches chronologically when 7 are available', async () => {
      // Arrange (oldest to newest): m1 to m7
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamA', 'teamB', 2, 0, 'FINISHED', '2026-09-01T18:00:00Z'),
        createMatch('m2', 'teamA', 'teamC', 2, 0, 'FINISHED', '2026-09-02T18:00:00Z'),
        createMatch('m3', 'teamA', 'teamD', 1, 0, 'FINISHED', '2026-09-03T18:00:00Z'), // expected last5
        createMatch('m4', 'teamA', 'teamE', 1, 0, 'FINISHED', '2026-09-04T18:00:00Z'), // expected last5
        createMatch('m5', 'teamA', 'teamF', 1, 0, 'FINISHED', '2026-09-05T18:00:00Z'), // expected last5
        createMatch('m6', 'teamA', 'teamG', 1, 0, 'FINISHED', '2026-09-06T18:00:00Z'), // expected last5
        createMatch('m7', 'teamA', 'teamH', 1, 0, 'FINISHED', '2026-09-07T18:00:00Z'), // expected last5
      ]);

      // Act
      const result = await getTeamFormStats('teamA', new Date('2099-01-01T00:00:00Z'));

      // Assert
      expect(result.last5.matches).toBe(5);
      expect(result.last5.goalsFor).toBe(5);
    });
  });

  describe('Test 3 — last10', () => {
    it('should use only the last 10 matches chronologically when 12 are available', async () => {
      // Arrange (oldest to newest): 12 matches
      const matches = Array.from({ length: 12 }, (_, i) => {
        const dateStr = `2026-09-${(i + 1).toString().padStart(2, '0')}T18:00:00Z`;
        // First 2 matches are 2 goals scored each, remaining 10 are 1 goal scored each
        const homeScore = i < 2 ? 2 : 1;
        return createMatch(`m${i + 1}`, 'teamA', 'teamB', homeScore, 0, 'FINISHED', dateStr);
      });
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue(matches);

      // Act
      const result = await getTeamFormStats('teamA', new Date('2099-01-01T00:00:00Z'));

      // Assert
      expect(result.last10.matches).toBe(10);
      expect(result.last10.goalsFor).toBe(10); // should be the last 10 (each has homeScore = 1)
    });
  });

  describe('Test 4 — fewer than window', () => {
    it('should handle fewer matches than the window size', async () => {
      // Arrange (4 matches)
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamA', 'teamB', 1, 0, 'FINISHED', '2026-09-01T18:00:00Z'),
        createMatch('m2', 'teamA', 'teamC', 1, 0, 'FINISHED', '2026-09-02T18:00:00Z'),
        createMatch('m3', 'teamA', 'teamD', 1, 0, 'FINISHED', '2026-09-03T18:00:00Z'),
        createMatch('m4', 'teamA', 'teamE', 1, 0, 'FINISHED', '2026-09-04T18:00:00Z'),
      ]);

      // Act
      const result = await getTeamFormStats('teamA', new Date('2099-01-01T00:00:00Z'));

      // Assert
      expect(result.last3.matches).toBe(3);
      expect(result.last5.matches).toBe(4);
      expect(result.last10.matches).toBe(4);
    });
  });

  describe('Test 5 — non-eligible matches', () => {
    it('should ignore non-eligible matches', async () => {
      // Arrange
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamA', 'teamB', 1, 0, 'FINISHED', '2026-09-01T18:00:00Z'), // Eligible
        createMatch('m2', 'teamA', 'teamC', null, null, 'SCHEDULED', '2026-09-02T18:00:00Z'), // Non-eligible
        createMatch('m3', 'teamA', 'teamD', 2, 1, 'LIVE', '2026-09-03T18:00:00Z'), // Non-eligible
        createMatch('m4', 'teamA', 'teamE', 3, 0, 'VOID', '2026-09-04T18:00:00Z'), // Non-eligible
        createMatch('m5', 'teamA', 'teamF', null, null, 'FINISHED', '2026-09-05T18:00:00Z'), // Non-eligible (null score)
      ]);

      // Act
      const result = await getTeamFormStats('teamA', new Date('2099-01-01T00:00:00Z'));

      // Assert
      expect(result.last3.matches).toBe(1);
      expect(result.last5.matches).toBe(1);
      expect(result.last10.matches).toBe(1);
    });
  });

  describe('Test 6 — chronological ordering', () => {
    it('should sort non-sorted return matches chronologically before slicing', async () => {
      // Arrange: mock provider returns me me5 first (newest), then me1 (oldest), etc.
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m5', 'teamA', 'teamF', 5, 0, 'FINISHED', '2026-09-05T18:00:00Z'), // newest
        createMatch('m1', 'teamA', 'teamB', 1, 0, 'FINISHED', '2026-09-01T18:00:00Z'), // oldest
        createMatch('m4', 'teamA', 'teamE', 4, 0, 'FINISHED', '2026-09-04T18:00:00Z'),
        createMatch('m3', 'teamA', 'teamD', 3, 0, 'FINISHED', '2026-09-03T18:00:00Z'),
        createMatch('m2', 'teamA', 'teamC', 2, 0, 'FINISHED', '2026-09-02T18:00:00Z'),
      ]);

      // Act
      const result = await getTeamFormStats('teamA', new Date('2099-01-01T00:00:00Z'));

      // Assert
      // Expected last3: m3 (3GF), m4 (4GF), m5 (5GF) = sum 12GF
      expect(result.last3.goalsFor).toBe(12);
    });
  });

  describe('Test 7 — last3 calculations', () => {
    it('should calculate wins, draws, losses, points, PPG, GF, GA, GD, GF/match, GA/match accurately', async () => {
      // Arrange
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamA', 'teamB', 3, 1, 'FINISHED', '2026-09-01T18:00:00Z'), // WIN (3-1) -> 3pts, GF:3, GA:1
        createMatch('m2', 'teamA', 'teamC', 1, 1, 'FINISHED', '2026-09-02T18:00:00Z'), // DRAW (1-1) -> 1pt, GF:1, GA:1
        createMatch('m3', 'teamA', 'teamD', 0, 2, 'FINISHED', '2026-09-03T18:00:00Z'), // LOSS (0-2) -> 0pts, GF:0, GA:2
      ]);

      // Act
      const result = await getTeamFormStats('teamA', new Date('2099-01-01T00:00:00Z'));
      const stats = result.last3;

      // Assert
      expect(stats.matches).toBe(3);
      expect(stats.wins).toBe(1);
      expect(stats.draws).toBe(1);
      expect(stats.losses).toBe(1);
      expect(stats.points).toBe(4);
      expect(stats.pointsPerMatch).toBeCloseTo(4 / 3);
      expect(stats.goalsFor).toBe(4);
      expect(stats.goalsAgainst).toBe(4);
      expect(stats.goalDifference).toBe(0);
      expect(stats.goalsForPerMatch).toBeCloseTo(4 / 3);
      expect(stats.goalsAgainstPerMatch).toBeCloseTo(4 / 3);
      expect(stats.goalDifferencePerMatch).toBe(0);
    });
  });

  describe('Test 8 — recent clean sheets / failed to score / BTTS', () => {
    it('should calculate clean sheets, failed to score, BTTS rates correctly', async () => {
      // Arrange
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamA', 'teamB', 2, 0, 'FINISHED', '2026-09-01T18:00:00Z'), // CS, NOT FTS, NOT BTTS
        createMatch('m2', 'teamA', 'teamC', 0, 1, 'FINISHED', '2026-09-02T18:00:00Z'), // NOT CS, FTS, NOT BTTS
        createMatch('m3', 'teamA', 'teamD', 2, 1, 'FINISHED', '2026-09-03T18:00:00Z'), // NOT CS, NOT FTS, BTTS
      ]);

      // Act
      const result = await getTeamFormStats('teamA', new Date('2099-01-01T00:00:00Z'));
      const stats = result.last3;

      // Assert
      expect(stats.cleanSheets).toBe(1);
      expect(stats.cleanSheetRate).toBeCloseTo(1 / 3);
      expect(stats.failedToScore).toBe(1);
      expect(stats.failedToScoreRate).toBeCloseTo(1 / 3);
      expect(stats.bttsYes).toBe(1);
      expect(stats.bttsRate).toBeCloseTo(1 / 3);
    });
  });

  describe('Test 9 — recent Over rates', () => {
    it('should calculate over15, over25, over35 rates correctly', async () => {
      // Arrange
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamA', 'teamB', 1, 0, 'FINISHED', '2026-09-01T18:00:00Z'), // total 1
        createMatch('m2', 'teamA', 'teamC', 1, 1, 'FINISHED', '2026-09-02T18:00:00Z'), // total 2 -> Over 1.5
        createMatch('m3', 'teamA', 'teamD', 2, 1, 'FINISHED', '2026-09-03T18:00:00Z'), // total 3 -> Over 1.5, 2.5
        createMatch('m4', 'teamA', 'teamE', 2, 2, 'FINISHED', '2026-09-04T18:00:00Z'), // total 4 -> Over 1.5, 2.5, 3.5
      ]);

      // Act
      const result = await getTeamFormStats('teamA', new Date('2099-01-01T00:00:00Z'));
      const stats = result.last5; // covers all 4 matches since fewer than 5

      // Assert
      expect(stats.matches).toBe(4);
      expect(stats.over15).toBe(3);
      expect(stats.over15Rate).toBeCloseTo(3 / 4);
      expect(stats.over25).toBe(2);
      expect(stats.over25Rate).toBeCloseTo(2 / 4);
      expect(stats.over35).toBe(1);
      expect(stats.over35Rate).toBeCloseTo(1 / 4);
    });
  });

  describe('Test 10 — zero matches', () => {
    it('should return zeros for all rates and counters with no eligible matches', async () => {
      // Arrange
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([]);

      // Act
      const result = await getTeamFormStats('teamA', new Date('2099-01-01T00:00:00Z'));

      // Assert
      for (const windowKey of ['last3', 'last5', 'last10'] as const) {
        const stats = result[windowKey];
        expect(stats.matches).toBe(0);
        expect(stats.wins).toBe(0);
        expect(stats.draws).toBe(0);
        expect(stats.losses).toBe(0);
        expect(stats.points).toBe(0);
        expect(stats.pointsPerMatch).toBe(0);
        expect(stats.goalsFor).toBe(0);
        expect(stats.goalsAgainst).toBe(0);
        expect(stats.goalDifference).toBe(0);
        expect(stats.goalsForPerMatch).toBe(0);
        expect(stats.goalsAgainstPerMatch).toBe(0);
        expect(stats.goalDifferencePerMatch).toBe(0);
        expect(stats.cleanSheets).toBe(0);
        expect(stats.cleanSheetRate).toBe(0);
        expect(stats.failedToScore).toBe(0);
        expect(stats.failedToScoreRate).toBe(0);
        expect(stats.bttsYes).toBe(0);
        expect(stats.bttsRate).toBe(0);
        expect(stats.over15).toBe(0);
        expect(stats.over15Rate).toBe(0);
        expect(stats.over25).toBe(0);
        expect(stats.over25Rate).toBe(0);
        expect(stats.over35).toBe(0);
        expect(stats.over35Rate).toBe(0);
      }
    });
  });

  describe('Test 11 — away matches', () => {
    it('should calculate GF, GA, results calculated correctly when team is away', async () => {
      // Arrange (teamA is away)
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamB', 'teamA', 1, 3, 'FINISHED', '2026-09-01T18:00:00Z'), // Away win for teamA (3-1)
      ]);

      // Act
      const result = await getTeamFormStats('teamA', new Date('2099-01-01T00:00:00Z'));
      const stats = result.last3;

      // Assert
      expect(stats.matches).toBe(1);
      expect(stats.wins).toBe(1);
      expect(stats.goalsFor).toBe(3);
      expect(stats.goalsAgainst).toBe(1);
      expect(stats.points).toBe(3);
    });
  });

  describe('Test 12 — window independence', () => {
    it('should calculate each window independently and produce different results when applicable', async () => {
      // Arrange (oldest to newest): 6 matches
      // First 3 matches are losses (0-2) -> total 0 pts
      // Last 3 matches are wins (3-0) -> total 9 pts
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamA', 'teamB', 0, 2, 'FINISHED', '2026-09-01T18:00:00Z'),
        createMatch('m2', 'teamA', 'teamC', 0, 2, 'FINISHED', '2026-09-02T18:00:00Z'),
        createMatch('m3', 'teamA', 'teamD', 0, 2, 'FINISHED', '2026-09-03T18:00:00Z'),
        createMatch('m4', 'teamA', 'teamE', 3, 0, 'FINISHED', '2026-09-04T18:00:00Z'),
        createMatch('m5', 'teamA', 'teamF', 3, 0, 'FINISHED', '2026-09-05T18:00:00Z'),
        createMatch('m6', 'teamA', 'teamG', 3, 0, 'FINISHED', '2026-09-06T18:00:00Z'),
      ]);

      // Act
      const result = await getTeamFormStats('teamA', new Date('2099-01-01T00:00:00Z'));

      // Assert
      // last3: m4, m5, m6 -> 3 wins, 9 points
      expect(result.last3.wins).toBe(3);
      expect(result.last3.points).toBe(9);

      // last5: m2, m3, m4, m5, m6 -> 3 wins, 2 losses, 9 points
      expect(result.last5.wins).toBe(3);
      expect(result.last5.losses).toBe(2);
      expect(result.last5.points).toBe(9);
    });
  });
});
