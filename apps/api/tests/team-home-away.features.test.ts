import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTeamHomeAwayStats } from '../src/odds-engine/features/team-home-away.features';
import { matchHistoryProvider } from '../src/odds-engine/providers/match-history.provider';
import { TeamHomeAwayStats } from '../src/odds-engine/features/team-home-away.types';

vi.mock('../src/odds-engine/providers/match-history.provider', () => ({
  matchHistoryProvider: {
    getTeamMatches: vi.fn(),
  },
}));

describe('getTeamHomeAwayStats', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // Helper to create match records (same as in team-basic-stats.features.test.ts)
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

  describe('Test 1 — Separate HOME and AWAY correctly', () => {
    it('should partition home and away matches correctly', async () => {
      // Arrange
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamX', 'teamY', 2, 1), // HOME for teamX
        createMatch('m2', 'teamZ', 'teamX', 0, 3), // AWAY for teamX
        createMatch('m3', 'teamX', 'teamW', 1, 1), // HOME for teamX
        createMatch('m4', 'teamV', 'teamX', 2, 2), // AWAY for teamX
        createMatch('m5', 'teamA', 'teamB', 0, 0), // Other team, should be ignored
      ]);

      // Act
      const result = await getTeamHomeAwayStats('teamX', new Date('2099-01-01T00:00:00Z'));

      // Assert
      expect(result.home.matches).toBe(2); // m1, m3
      expect(result.away.matches).toBe(2); // m2, m4
      expect(result.teamId).toBe('teamX');
    });
  });

  describe('Test 2 — Calculate HOME wins/draws/losses', () => {
    it('should calculate home wins, draws, losses correctly', async () => {
      // Arrange
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamA', 'teamB', 3, 1), // HOME WIN
        createMatch('m2', 'teamA', 'teamC', 2, 2), // HOME DRAW
        createMatch('m3', 'teamA', 'teamD', 0, 2), // HOME LOSS
        createMatch('m4', 'teamX', 'teamA', 1, 1), // AWAY match (ignored for home stats)
      ]);

      // Act
      const result = await getTeamHomeAwayStats('teamA', new Date('2099-01-01T00:00:00Z'));

      // Assert for HOME
      expect(result.home.matches).toBe(3);
      expect(result.home.wins).toBe(1);
      expect(result.home.draws).toBe(1);
      expect(result.home.losses).toBe(1);
      expect(result.home.points).toBe(4); // 3 + 1 + 0
    });
  });

  describe('Test 3 — Calculate AWAY wins/draws/losses', () => {
    it('should calculate away wins, draws, losses correctly', async () => {
      // Arrange
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamX', 'teamA', 1, 3), // AWAY WIN (teamA scored 3)
        createMatch('m2', 'teamY', 'teamA', 2, 2), // AWAY DRAW (teamA scored 2)
        createMatch('m3', 'teamZ', 'teamA', 0, 1), // AWAY LOSS (teamA scored 1)
        createMatch('m4', 'teamA', 'teamW', 2, 0), // HOME match (ignored for away stats)
      ]);

      // Act
      const result = await getTeamHomeAwayStats('teamA', new Date('2099-01-01T00:00:00Z'));

      // Assert for AWAY
      expect(result.away.matches).toBe(3);
      expect(result.away.wins).toBe(2); // m1 (3>1), m3 (1>0)
      expect(result.away.draws).toBe(1); // m2
      expect(result.away.losses).toBe(0);
      expect(result.away.points).toBe(7); // 3 + 3 + 1
    });
  });

  describe('Test 4 — Calculate HOME GF/GA/GD', () => {
    it('should calculate home goals for, against, and difference correctly', async () => {
      // Arrange
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamA', 'teamB', 3, 1), // GF:3, GA:1
        createMatch('m2', 'teamA', 'teamC', 0, 2), // GF:0, GA:2
        createMatch('m3', 'teamA', 'teamD', 2, 2), // GF:2, GA:2
        createMatch('m4', 'teamX', 'teamA', 1, 0), // AWAY match (ignored for home stats)
      ]);

      // Act
      const result = await getTeamHomeAwayStats('teamA', new Date('2099-01-01T00:00:00Z'));

      // Assert for HOME
      expect(result.home.goalsFor).toBe(5); // 3 + 0 + 2
      expect(result.home.goalsAgainst).toBe(5); // 1 + 2 + 2
      expect(result.home.goalDifference).toBe(0); // 5 - 5
    });
  });

  describe('Test 5 — Calculate AWAY GF/GA/GD', () => {
    it('should calculate away goals for, against, and difference correctly', async () => {
      // Arrange
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamX', 'teamA', 1, 3), // GF:3, GA:1 (teamA away)
        createMatch('m2', 'teamY', 'teamA', 0, 2), // GF:2, GA:0 (teamA away)
        createMatch('m3', 'teamZ', 'teamA', 2, 2), // GF:2, GA:2 (teamA away)
        createMatch('m4', 'teamA', 'teamW', 2, 0), // HOME match (ignored for away stats)
      ]);

      // Act
      const result = await getTeamHomeAwayStats('teamA', new Date('2099-01-01T00:00:00Z'));

      // Assert for AWAY
      expect(result.away.goalsFor).toBe(7); // 3 + 2 + 2
      expect(result.away.goalsAgainst).toBe(3); // 1 + 0 + 2
      expect(result.away.goalDifference).toBe(4); // 7 - 3
    });
  });

  describe('Test 6 — Calculate HOME points and pointsPerMatch', () => {
    it('should calculate home points and points per match correctly', async () => {
      // Arrange
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamA', 'teamB', 3, 1), // WIN -> 3 points
        createMatch('m2', 'teamA', 'teamC', 2, 2), // DRAW -> 1 point
        createMatch('m3', 'teamA', 'teamD', 0, 1), // LOSS -> 0 points
        createMatch('m4', 'teamX', 'teamA', 1, 1), // AWAY match (ignored for home stats)
      ]);

      // Act
      const result = await getTeamHomeAwayStats('teamA', new Date('2099-01-01T00:00:00Z'));

      // Assert for HOME
      expect(result.home.matches).toBe(3);
      expect(result.home.points).toBe(4); // 3 + 1 + 0
      expect(result.home.pointsPerMatch).toBeCloseTo(4 / 3);
    });
  });

  describe('Test 7 — Calculate AWAY points and pointsPerMatch', () => {
    it('should calculate away points and points per match correctly', async () => {
      // Arrange
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamX', 'teamA', 1, 3), // AWAY WIN -> 3 points
        createMatch('m2', 'teamY', 'teamA', 2, 2), // AWAY DRAW -> 1 point
        createMatch('m3', 'teamZ', 'teamA', 0, 1), // AWAY LOSS -> 0 points
        createMatch('m4', 'teamA', 'teamW', 2, 0), // HOME match (ignored for away stats)
      ]);

      // Act
      const result = await getTeamHomeAwayStats('teamA', new Date('2099-01-01T00:00:00Z'));

      // Assert for AWAY
      expect(result.away.matches).toBe(3);
      expect(result.away.points).toBe(7); // 3 + 1 + 3 (m3: teamA scored 1, teamZ scored 0 -> teamA won)
      expect(result.away.pointsPerMatch).toBeCloseTo(7 / 3);
    });
  });

  describe('Test 8 — HOME clean sheets / failed to score / BTTS', () => {
    it('should calculate home clean sheets, failed to score, and BTTS correctly', async () => {
      // Arrange
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamA', 'teamB', 2, 0), // HOME: Clean sheet, Scored
        createMatch('m2', 'teamA', 'teamC', 0, 0), // HOME: Clean sheet, Failed to score
        createMatch('m3', 'teamA', 'teamD', 1, 1), // HOME: Not clean sheet, Scored, BTTS
        createMatch('m4', 'teamA', 'teamE', 0, 2), // HOME: Not clean sheet, Failed to score, Not BTTS
        createMatch('m5', 'teamX', 'teamA', 1, 0), // AWAY match (ignored for home stats)
      ]);

      // Act
      const result = await getTeamHomeAwayStats('teamA', new Date('2099-01-01T00:00:00Z'));

      // Assert for HOME
      expect(result.home.cleanSheets).toBe(2); // m1, m2
      expect(result.home.cleanSheetRate).toBeCloseTo(2 / 4);
      expect(result.home.failedToScore).toBe(2); // m2, m4
      expect(result.home.failedToScoreRate).toBeCloseTo(2 / 4);
      expect(result.home.bttsYes).toBe(1); // m3
      expect(result.home.bttsRate).toBeCloseTo(1 / 4);
    });
  });

  describe('Test 9 — AWAY clean sheets / failed to score / BTTS', () => {
    it('should calculate away clean sheets, failed to score, and BTTS correctly', async () => {
      // Arrange
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamX', 'teamA', 0, 2), // AWAY: Clean sheet (conceded 0), Scored 2
        createMatch('m2', 'teamY', 'teamA', 0, 0), // AWAY: Clean sheet (conceded 0), Failed to score 0
        createMatch('m3', 'teamZ', 'teamA', 1, 1), // AWAY: Not clean sheet, Scored 1, BTTS
        createMatch('m4', 'teamW', 'teamA', 2, 0), // AWAY: Not clean sheet, Failed to score 0, Not BTTS
        createMatch('m5', 'teamA', 'teamV', 2, 0), // HOME match (ignored for away stats)
      ]);

      // Act
      const result = await getTeamHomeAwayStats('teamA', new Date('2099-01-01T00:00:00Z'));

      // Assert for AWAY
      expect(result.away.cleanSheets).toBe(2); // m1, m2
      expect(result.away.cleanSheetRate).toBeCloseTo(2 / 4);
      expect(result.away.failedToScore).toBe(2); // m2 and m4
      expect(result.away.failedToScoreRate).toBeCloseTo(2 / 4);
      expect(result.away.bttsYes).toBe(1); // m3 only
      expect(result.away.bttsRate).toBeCloseTo(1 / 4);
    });
  });

  describe('Test 10 — HOME Over 1.5 / 2.5 / 3.5', () => {
    it('should calculate home over/under statistics correctly', async () => {
      // Arrange
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamA', 'teamB', 1, 0), // Total: 1 -> Over 1.5: No, Over 2.5: No, Over 3.5: No
        createMatch('m2', 'teamA', 'teamC', 1, 1), // Total: 2 -> Over 1.5: Yes, Over 2.5: No, Over 3.5: No
        createMatch('m3', 'teamA', 'teamD', 2, 1), // Total: 3 -> Over 1.5: Yes, Over 2.5: Yes, Over 3.5: No
        createMatch('m4', 'teamA', 'teamE', 2, 2), // Total: 4 -> Over 1.5: Yes, Over 2.5: Yes, Over 3.5: Yes
        createMatch('m5', 'teamX', 'teamA', 0, 0), // AWAY match (ignored for home stats)
      ]);

      // Act
      const result = await getTeamHomeAwayStats('teamA', new Date('2099-01-01T00:00:00Z'));

      // Assert for HOME
      expect(result.home.over15).toBe(3); // Matches m2, m3, m4
      expect(result.home.over15Rate).toBeCloseTo(3 / 4);
      expect(result.home.over25).toBe(2); // Matches m3, m4
      expect(result.home.over25Rate).toBeCloseTo(2 / 4);
      expect(result.home.over35).toBe(1); // Match m4
      expect(result.home.over35Rate).toBeCloseTo(1 / 4);
    });
  });

  describe('Test 11 — AWAY Over 1.5 / 2.5 / 3.5', () => {
    it('should calculate away over/under statistics correctly', async () => {
      // Arrange
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamX', 'teamA', 0, 1), // Total: 1 -> Over 1.5: No, Over 2.5: No, Over 3.5: No (teamA away)
        createMatch('m2', 'teamY', 'teamA', 1, 1), // Total: 2 -> Over 1.5: Yes, Over 2.5: No, Over 3.5: No (teamA away)
        createMatch('m3', 'teamZ', 'teamA', 1, 2), // Total: 3 -> Over 1.5: Yes, Over 2.5: Yes, Over 3.5: No (teamA away)
        createMatch('m4', 'teamW', 'teamA', 2, 2), // Total: 4 -> Over 1.5: Yes, Over 2.5: Yes, Over 3.5: Yes (teamA away)
        createMatch('m5', 'teamA', 'teamV', 2, 0), // HOME match (ignored for away stats)
      ]);

      // Act
      const result = await getTeamHomeAwayStats('teamA', new Date('2099-01-01T00:00:00Z'));

      // Assert for AWAY
      expect(result.away.over15).toBe(3); // Matches m2, m3, m4
      expect(result.away.over15Rate).toBeCloseTo(3 / 4);
      expect(result.away.over25).toBe(2); // Matches m3, m4
      expect(result.away.over25Rate).toBeCloseTo(2 / 4);
      expect(result.away.over35).toBe(1); // Match m4
      expect(result.away.over35Rate).toBeCloseTo(1 / 4);
    });
  });

  describe('Test 12 — Ignore non-eligible matches', () => {
    it('should ignore SCHEDULED/LIVE/VOID matches and FINISHED with null scores', async () => {
      // Arrange
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamA', 'teamB', 2, 1), // FINISHED - should count (HOME)
        createMatch('m2', 'teamA', 'teamC', null, null, 'SCHEDULED'), // SCHEDULED - should ignore
        createMatch('m3', 'teamA', 'teamD', 1, 0, 'LIVE'), // LIVE - should ignore
        createMatch('m4', 'teamA', 'teamE', 3, 2, 'VOID'), // VOID - should ignore
        createMatch('m5', 'teamA', 'teamF', null, null, 'FINISHED'), // FINISHED but null scores - should ignore
        createMatch('m6', 'teamX', 'teamA', 2, 1), // FINISHED - should count (AWAY)
      ]);

      // Act
      const result = await getTeamHomeAwayStats('teamA', new Date('2099-01-01T00:00:00Z'));

      // Assert
      expect(result.home.matches).toBe(1); // Only m1
      expect(result.away.matches).toBe(1); // Only m6
      expect(result.home.wins).toBe(1); // m1: teamA scored 2 at home -> win
      expect(result.away.wins).toBe(0); // m6: teamA scored 1 away (teamX 2-1 teamA) -> loss
    });
  });

  describe('Test 13 — Zero HOME matches', () => {
    it('should return zero for all HOME stats when team has no home matches', async () => {
      // Arrange
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamX', 'teamA', 1, 2), // AWAY match for teamA
        createMatch('m2', 'teamY', 'teamA', 0, 0), // AWAY match for teamA
        createMatch('m3', 'teamZ', 'teamW', 2, 1), // Other team's match
      ]);

      // Act
      const result = await getTeamHomeAwayStats('teamA', new Date('2099-01-01T00:00:00Z'));

      // Assert for HOME (should be all zeros)
      expect(result.home.matches).toBe(0);
      expect(result.home.wins).toBe(0);
      expect(result.home.draws).toBe(0);
      expect(result.home.losses).toBe(0);
      expect(result.home.points).toBe(0);
      expect(result.home.pointsPerMatch).toBe(0);
      expect(result.home.goalsFor).toBe(0);
      expect(result.home.goalsAgainst).toBe(0);
      expect(result.home.goalDifference).toBe(0);
      expect(result.home.goalsForPerMatch).toBe(0);
      expect(result.home.goalsAgainstPerMatch).toBe(0);
      expect(result.home.goalDifferencePerMatch).toBe(0);
      expect(result.home.cleanSheets).toBe(0);
      expect(result.home.cleanSheetRate).toBe(0);
      expect(result.home.failedToScore).toBe(0);
      expect(result.home.failedToScoreRate).toBe(0);
      expect(result.home.bttsYes).toBe(0);
      expect(result.home.bttsRate).toBe(0);
      expect(result.home.over15).toBe(0);
      expect(result.home.over15Rate).toBe(0);
      expect(result.home.over25).toBe(0);
      expect(result.home.over25Rate).toBe(0);
      expect(result.home.over35).toBe(0);
      expect(result.home.over35Rate).toBe(0);

      // Assert for AWAY (should have values)
      expect(result.away.matches).toBe(2);
      expect(result.away.draws).toBe(1); // m2: 0-0
      expect(result.away.wins).toBe(1);  // m1: 1-2 -> teamA won
    });
  });

  describe('Test 14 — Zero AWAY matches', () => {
    it('should return zero for all AWAY stats when team has no away matches', async () => {
      // Arrange
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamA', 'teamX', 2, 1), // HOME match for teamA
        createMatch('m2', 'teamA', 'teamY', 0, 0), // HOME match for teamA
        createMatch('m3', 'teamZ', 'teamW', 2, 1), // Other team's match
      ]);

      // Act
      const result = await getTeamHomeAwayStats('teamA', new Date('2099-01-01T00:00:00Z'));

      // Assert for AWAY (should be all zeros)
      expect(result.away.matches).toBe(0);
      expect(result.away.wins).toBe(0);
      expect(result.away.draws).toBe(0);
      expect(result.away.losses).toBe(0);
      expect(result.away.points).toBe(0);
      expect(result.away.pointsPerMatch).toBe(0);
      expect(result.away.goalsFor).toBe(0);
      expect(result.away.goalsAgainst).toBe(0);
      expect(result.away.goalDifference).toBe(0);
      expect(result.away.goalsForPerMatch).toBe(0);
      expect(result.away.goalsAgainstPerMatch).toBe(0);
      expect(result.away.goalDifferencePerMatch).toBe(0);
      expect(result.away.cleanSheets).toBe(0);
      expect(result.away.cleanSheetRate).toBe(0);
      expect(result.away.failedToScore).toBe(0);
      expect(result.away.failedToScoreRate).toBe(0);
      expect(result.away.bttsYes).toBe(0);
      expect(result.away.bttsRate).toBe(0);
      expect(result.away.over15).toBe(0);
      expect(result.away.over15Rate).toBe(0);
      expect(result.away.over25).toBe(0);
      expect(result.away.over25Rate).toBe(0);
      expect(result.away.over35).toBe(0);
      expect(result.away.over35Rate).toBe(0);

      // Assert for HOME (should have values)
      expect(result.home.matches).toBe(2);
      expect(result.home.draws).toBe(1); // m2: 0-0
      expect(result.home.wins).toBe(1);  // m1: 2-1 -> teamA won
    });
  });

  describe('Test 15 — Team with only HOME matches', () => {
    it('should handle team with only home matches correctly', async () => {
      // Arrange
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamA', 'teamB', 3, 0), // HOME WIN
        createMatch('m2', 'teamA', 'teamC', 1, 1), // HOME DRAW
        createMatch('m3', 'teamA', 'teamD', 0, 2), // HOME LOSS
        // No away matches for teamA
      ]);

      // Act
      const result = await getTeamHomeAwayStats('teamA', new Date('2099-01-01T00:00:00Z'));

      // Assert
      expect(result.home.matches).toBe(3);
      expect(result.home.wins).toBe(1);
      expect(result.home.draws).toBe(1);
      expect(result.home.losses).toBe(1);
      expect(result.home.points).toBe(4); // 3 + 1 + 0
      expect(result.home.pointsPerMatch).toBeCloseTo(4 / 3);

      expect(result.away.matches).toBe(0);
      // All away stats should be zero
      expect(result.away.wins).toBe(0);
      expect(result.away.draws).toBe(0);
      expect(result.away.losses).toBe(0);
      expect(result.away.points).toBe(0);
    });
  });

  describe('Test 16 — Team with only AWAY matches', () => {
    it('should handle team with only away matches correctly', async () => {
      // Arrange
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamX', 'teamA', 0, 3), // AWAY WIN (teamA scored 3)
        createMatch('m2', 'teamY', 'teamA', 2, 2), // AWAY DRAW (teamA scored 2)
        createMatch('m3', 'teamZ', 'teamA', 1, 0), // AWAY WIN (teamA scored 1)
        // No home matches for teamA
      ]);

      // Act
      const result = await getTeamHomeAwayStats('teamA', new Date('2099-01-01T00:00:00Z'));

      // Assert
      expect(result.away.matches).toBe(3);
      expect(result.away.wins).toBe(1); // m1 only (m3: teamZ 1-0 teamA -> teamA lost)
      expect(result.away.draws).toBe(1); // m2
      expect(result.away.losses).toBe(1); // m3
      expect(result.away.points).toBe(4); // 3 + 1 + 0
      expect(result.away.pointsPerMatch).toBeCloseTo(4 / 3);

      expect(result.home.matches).toBe(0);
      // All home stats should be zero
      expect(result.home.wins).toBe(0);
      expect(result.home.draws).toBe(0);
      expect(result.home.losses).toBe(0);
      expect(result.home.points).toBe(0);
    });
  });

  describe('Test 17 — Team isolation: other teams matches ignored', () => {
    it('should not include matches of other teams in statistics', async () => {
      // Arrange: mock getTeamMatches to return only matches where teamA participates (provider should already isolate by team)
      // But we'll test that our function doesn't accidentally include other teams' matches if they were somehow included
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        createMatch('m1', 'teamA', 'teamB', 2, 1), // HOME win for teamA
        createMatch('m2', 'teamC', 'teamD', 3, 0), // Other teams' match - should be ignored by our filtering
        createMatch('m3', 'teamA', 'teamE', 0, 2), // AWAY loss for teamA
        createMatch('m4', 'teamF', 'teamG', 1, 1), // Other teams' match - should be ignored
      ]);

      // Act
      const result = await getTeamHomeAwayStats('teamA', new Date('2099-01-01T00:00:00Z'));

      // Assert: only teamA's matches should count
      // m1: teamA is HOME (homeTeamId='teamA'), m3: teamA is HOME (homeTeamId='teamA')
      // m2 and m4 do not involve teamA
      expect(result.home.matches).toBe(2); // m1 and m3 are both HOME for teamA
      expect(result.away.matches).toBe(0); // No AWAY matches for teamA
      expect(result.home.wins).toBe(1);    // m1: 2-1 -> win
      expect(result.home.losses).toBe(1);  // m3: 0-2 -> loss
    });
  });

  describe('Test 18 — Mixed HOME and AWAY with different results (regression test)', () => {
    it('should correctly calculate stats when team has both home and away matches with varied results', async () => {
      // Arrange
      // HOME matches:
      // 2-0 win (GF:2, GA:0)
      // 1-1 draw (GF:1, GA:1)
      // 0-1 loss (GF:0, GA:1)
      // AWAY matches:
      // 0-3 loss (GF:0, GA:3)
      // 2-2 draw (GF:2, GA:2)
      // 1-0 win (GF:1, GA:0)
      (matchHistoryProvider.getTeamMatches as any).mockResolvedValue([
        // HOME matches
        createMatch('m1', 'teamA', 'teamB', 2, 0), // HOME: 2-0 win
        createMatch('m2', 'teamA', 'teamC', 1, 1), // HOME: 1-1 draw
        createMatch('m3', 'teamA', 'teamD', 0, 1), // HOME: 0-1 loss
        // AWAY matches
        createMatch('m4', 'teamX', 'teamA', 0, 3), // AWAY: 0-3 loss
        createMatch('m5', 'teamY', 'teamA', 2, 2), // AWAY: 2-2 draw
        createMatch('m6', 'teamZ', 'teamA', 1, 0), // AWAY: 1-0 win
      ]);

      // Act
      const result = await getTeamHomeAwayStats('teamA', new Date('2099-01-01T00:00:00Z'));

      // Assert for HOME (3 matches: m1 2-0, m2 1-1, m3 0-1)
      expect(result.home.matches).toBe(3);
      expect(result.home.wins).toBe(1);   // m1
      expect(result.home.draws).toBe(1);  // m2
      expect(result.home.losses).toBe(1); // m3
      expect(result.home.points).toBe(4); // 3 + 1 + 0
      expect(result.home.goalsFor).toBe(3); // 2 + 1 + 0
      expect(result.home.goalsAgainst).toBe(2); // 0 + 1 + 1
      expect(result.home.goalDifference).toBe(1); // 3 - 2
      expect(result.home.cleanSheets).toBe(1); // m1 only
      expect(result.home.failedToScore).toBe(1); // m3 only
      expect(result.home.bttsYes).toBe(1); // m2 only
      expect(result.home.over15).toBe(2); // m1 total=2, m2 total=2 (both over 1.5)

      // Assert for AWAY (3 matches: m4 0-3, m5 2-2, m6 1-0)
      expect(result.away.matches).toBe(3);
      expect(result.away.wins).toBe(1);   // m6 (1>0)
      expect(result.away.draws).toBe(1);  // m5
      expect(result.away.losses).toBe(1); // m4
      expect(result.away.points).toBe(4); // 0 + 1 + 3
      expect(result.away.goalsFor).toBe(5); // 0 + 2 + 1
      expect(result.away.goalsAgainst).toBe(3); // 3 + 2 + 0
      expect(result.away.goalDifference).toBe(2); // 5 - 3
      expect(result.away.cleanSheets).toBe(1); // m6 only (GA:0)
      expect(result.away.failedToScore).toBe(1); // m4 only (GF:0)
      expect(result.away.bttsYes).toBe(1); // m5 only (GF>0 && GA>0)
    });
  });
});