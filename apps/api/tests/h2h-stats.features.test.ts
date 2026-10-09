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

  // Test 1 — H2H with Team A home
  it('should calculate stats when Team A is home', async () => {
    // Arrange
    (matchHistoryProvider.getHeadToHead as any).mockResolvedValue([
      createMatch('m1', 'Ajax', 'Phoenix', 3, 1), // Ajax home, Ajax win
      createMatch('m2', 'Ajax', 'Phoenix', 2, 2), // Ajax home, draw
    ]);

    // Act
    const result = await getH2HStats('Ajax', 'Phoenix', new Date('2099-01-01T00:00:00Z'));

    // Assert
    expect(result.matches).toBe(2);
    expect(result.teamAWins).toBe(1);
    expect(result.draws).toBe(1);
    expect(result.teamBWins).toBe(0);
    expect(result.teamAGoals).toBe(5); // 3 + 2
    expect(result.teamBGoals).toBe(3); // 1 + 2
    expect(result.teamAWinRate).toBeCloseTo(0.5);
    expect(result.drawRate).toBeCloseTo(0.5);
    expect(result.teamBWinRate).toBeCloseTo(0);
  });

  // Test 2 — H2H with Team B home
  it('should calculate stats when Team B is home', async () => {
    // Arrange
    (matchHistoryProvider.getHeadToHead as any).mockResolvedValue([
      createMatch('m1', 'Phoenix', 'Ajax', 2, 4), // Phoenix home, Ajax win 4-2
      createMatch('m2', 'Phoenix', 'Ajax', 1, 1), // Phoenix home, draw
    ]);

    // Act
    const result = await getH2HStats('Ajax', 'Phoenix', new Date('2099-01-01T00:00:00Z'));

    // Assert
    expect(result.matches).toBe(2);
    expect(result.teamAWins).toBe(1);
    expect(result.draws).toBe(1);
    expect(result.teamBWins).toBe(0);
    expect(result.teamAGoals).toBe(5); // 4 + 1
    expect(result.teamBGoals).toBe(3); // 2 + 1
  });

  // Test 3 — Team A wins
  it('should count a Team A win correctly', async () => {
    // Arrange
    (matchHistoryProvider.getHeadToHead as any).mockResolvedValue([
      createMatch('m1', 'Ajax', 'Phoenix', 3, 1),
    ]);

    // Act
    const result = await getH2HStats('Ajax', 'Phoenix', new Date('2099-01-01T00:00:00Z'));

    // Assert
    expect(result.matches).toBe(1);
    expect(result.teamAWins).toBe(1);
    expect(result.draws).toBe(0);
    expect(result.teamBWins).toBe(0);
  });

  // Test 4 — Draw
  it('should count a draw correctly', async () => {
    // Arrange
    (matchHistoryProvider.getHeadToHead as any).mockResolvedValue([
      createMatch('m1', 'Ajax', 'Phoenix', 2, 2),
    ]);

    // Act
    const result = await getH2HStats('Ajax', 'Phoenix', new Date('2099-01-01T00:00:00Z'));

    // Assert
    expect(result.matches).toBe(1);
    expect(result.teamAWins).toBe(0);
    expect(result.draws).toBe(1);
    expect(result.teamBWins).toBe(0);
    expect(result.averageTotalGoals).toBeCloseTo(4);
  });

  // Test 5 — Team B wins
  it('should count a Team B win correctly', async () => {
    // Arrange
    (matchHistoryProvider.getHeadToHead as any).mockResolvedValue([
      createMatch('m1', 'Ajax', 'Phoenix', 1, 2),
    ]);

    // Act
    const result = await getH2HStats('Ajax', 'Phoenix', new Date('2099-01-01T00:00:00Z'));

    // Assert
    expect(result.matches).toBe(1);
    expect(result.teamAWins).toBe(0);
    expect(result.draws).toBe(0);
    expect(result.teamBWins).toBe(1);
  });

  // Test 6 — Team A goals
  it('should calculate Team A goals correctly', async () => {
    // Arrange
    (matchHistoryProvider.getHeadToHead as any).mockResolvedValue([
      createMatch('m1', 'Ajax', 'Phoenix', 3, 1), // Ajax goals: 3
      createMatch('m2', 'Phoenix', 'Ajax', 2, 4), // Ajax goals: 4
      createMatch('m3', 'Ajax', 'Phoenix', 0, 0), // Ajax goals: 0
    ]);

    // Act
    const result = await getH2HStats('Ajax', 'Phoenix', new Date('2099-01-01T00:00:00Z'));

    // Assert
    expect(result.teamAGoals).toBe(7); // 3 + 4 + 0
  });

  // Test 7 — Team B goals
  it('should calculate Team B goals correctly', async () => {
    // Arrange
    (matchHistoryProvider.getHeadToHead as any).mockResolvedValue([
      createMatch('m1', 'Ajax', 'Phoenix', 3, 1), // Phoenix goals: 1
      createMatch('m2', 'Phoenix', 'Ajax', 2, 4), // Phoenix goals: 2
      createMatch('m3', 'Ajax', 'Phoenix', 0, 0), // Phoenix goals: 0
    ]);

    // Act
    const result = await getH2HStats('Ajax', 'Phoenix', new Date('2099-01-01T00:00:00Z'));

    // Assert
    expect(result.teamBGoals).toBe(3); // 1 + 2 + 0
  });

  // Test 8 — Team A goals per match
  it('should calculate Team A goals per match correctly', async () => {
    // Arrange
    (matchHistoryProvider.getHeadToHead as any).mockResolvedValue([
      createMatch('m1', 'Ajax', 'Phoenix', 3, 1),
      createMatch('m2', 'Ajax', 'Phoenix', 3, 1),
      createMatch('m3', 'Ajax', 'Phoenix', 0, 0),
    ]);

    // Act
    const result = await getH2HStats('Ajax', 'Phoenix', new Date('2099-01-01T00:00:00Z'));

    // Assert
    expect(result.teamAGoalsPerMatch).toBeCloseTo(6 / 3);
  });

  // Test 9 — Team B goals per match
  it('should calculate Team B goals per match correctly', async () => {
    // Arrange
    (matchHistoryProvider.getHeadToHead as any).mockResolvedValue([
      createMatch('m1', 'Ajax', 'Phoenix', 3, 1),
      createMatch('m2', 'Phoenix', 'Ajax', 1, 1),
    ]);

    // Act
    const result = await getH2HStats('Ajax', 'Phoenix', new Date('2099-01-01T00:00:00Z'));

    // Assert
    expect(result.teamBGoalsPerMatch).toBeCloseTo(2 / 2);
  });

  // Test 10 — Team A win rate
  it('should calculate Team A win rate correctly', async () => {
    // Arrange
    (matchHistoryProvider.getHeadToHead as any).mockResolvedValue([
      createMatch('m1', 'Ajax', 'Phoenix', 3, 1), // win
      createMatch('m2', 'Ajax', 'Phoenix', 1, 2), // loss
      createMatch('m3', 'Ajax', 'Phoenix', 1, 0), // win
    ]);

    // Act
    const result = await getH2HStats('Ajax', 'Phoenix', new Date('2099-01-01T00:00:00Z'));

    // Assert
    expect(result.teamAWinRate).toBeCloseTo(2 / 3);
  });

  // Test 11 — Draw rate
  it('should calculate draw rate correctly', async () => {
    // Arrange
    (matchHistoryProvider.getHeadToHead as any).mockResolvedValue([
      createMatch('m1', 'Ajax', 'Phoenix', 1, 1), // draw
      createMatch('m2', 'Ajax', 'Phoenix', 1, 1), // draw
      createMatch('m3', 'Ajax', 'Phoenix', 2, 1), // win
      createMatch('m4', 'Ajax', 'Phoenix', 0, 2), // loss
    ]);

    // Act
    const result = await getH2HStats('Ajax', 'Phoenix', new Date('2099-01-01T00:00:00Z'));

    // Assert
    expect(result.drawRate).toBeCloseTo(2 / 4);
  });

  // Test 12 — Team B win rate
  it('should calculate Team B win rate correctly', async () => {
    // Arrange
    (matchHistoryProvider.getHeadToHead as any).mockResolvedValue([
      createMatch('m1', 'Ajax', 'Phoenix', 1, 2), // loss
      createMatch('m2', 'Ajax', 'Phoenix', 2, 3), // loss
      createMatch('m3', 'Ajax', 'Phoenix', 1, 1), // draw
    ]);

    // Act
    const result = await getH2HStats('Ajax', 'Phoenix', new Date('2099-01-01T00:00:00Z'));

    // Assert
    expect(result.teamBWinRate).toBeCloseTo(2 / 3);
  });

  // Test 13 — Average total goals
  it('should calculate average total goals correctly', async () => {
    // Arrange
    (matchHistoryProvider.getHeadToHead as any).mockResolvedValue([
      createMatch('m1', 'Ajax', 'Phoenix', 3, 1), // total 4
      createMatch('m2', 'Phoenix', 'Ajax', 2, 2), // total 4
      createMatch('m3', 'Ajax', 'Phoenix', 1, 0), // total 1
    ]);

    // Act
    const result = await getH2HStats('Ajax', 'Phoenix', new Date('2099-01-01T00:00:00Z'));

    // Assert
    expect(result.averageTotalGoals).toBeCloseTo(9 / 3);
  });

  // Test 14 — Ignore non-eligible statuses
  it('should ignore SCHEDULED / LIVE / VOID / other non-eligible statuses', async () => {
    // Arrange
    (matchHistoryProvider.getHeadToHead as any).mockResolvedValue([
      createMatch('m1', 'Ajax', 'Phoenix', 3, 1, 'FINISHED'),
      createMatch('m2', 'Ajax', 'Phoenix', 2, 2, 'SCHEDULED'),
      createMatch('m3', 'Ajax', 'Phoenix', 1, 0, 'LIVE'),
      createMatch('m4', 'Ajax', 'Phoenix', 3, 2, 'VOID'),
      createMatch('m5', 'Ajax', 'Phoenix', 1, 1, 'POSTPONED'),
      createMatch('m6', 'Ajax', 'Phoenix', 2, 0, 'CANCELLED'),
    ]);

    // Act
    const result = await getH2HStats('Ajax', 'Phoenix', new Date('2099-01-01T00:00:00Z'));

    // Assert
    expect(result.matches).toBe(1);
    expect(result.teamAWins).toBe(1);
    expect(result.teamBGoals).toBe(1);
  });

  // Test 15 — Ignore FINISHED matches with null scores
  it('should ignore FINISHED matches with null scores', async () => {
    // Arrange
    (matchHistoryProvider.getHeadToHead as any).mockResolvedValue([
      createMatch('m1', 'Ajax', 'Phoenix', 3, 1), // eligible
      createMatch('m2', 'Ajax', 'Phoenix', null, null), // FINISHED but null scores
    ]);

    // Act
    const result = await getH2HStats('Ajax', 'Phoenix', new Date('2099-01-01T00:00:00Z'));

    // Assert
    expect(result.matches).toBe(1);
    expect(result.teamAWins).toBe(1);
  });

  // Test 16 — Zero H2H
  it('should return zeros for teams with no H2H history', async () => {
    // Arrange
    (matchHistoryProvider.getHeadToHead as any).mockResolvedValue([]);

    // Act
    const result = await getH2HStats('Ajax', 'Phoenix', new Date('2099-01-01T00:00:00Z'));

    // Assert
    expect(result.teamAId).toBe('Ajax');
    expect(result.teamBId).toBe('Phoenix');
    expect(result.matches).toBe(0);
    expect(result.teamAWins).toBe(0);
    expect(result.draws).toBe(0);
    expect(result.teamBWins).toBe(0);
    expect(result.teamAGoals).toBe(0);
    expect(result.teamBGoals).toBe(0);
    expect(result.teamAGoalsPerMatch).toBe(0);
    expect(result.teamBGoalsPerMatch).toBe(0);
    expect(result.teamAWinRate).toBe(0);
    expect(result.drawRate).toBe(0);
    expect(result.teamBWinRate).toBe(0);
    expect(result.averageTotalGoals).toBe(0);

    // No NaN / Infinity in numeric fields only
    const numericKeys = [
      'matches',
      'teamAWins',
      'draws',
      'teamBWins',
      'teamAGoals',
      'teamBGoals',
      'teamAGoalsPerMatch',
      'teamBGoalsPerMatch',
      'teamAWinRate',
      'drawRate',
      'teamBWinRate',
      'averageTotalGoals',
    ];
    numericKeys.forEach((key) => {
      expect(Number.isFinite(result[key] as number)).toBe(true);
    });
  });

  // Test 17 — Same team IDs reject
  it('should reject identical team IDs', async () => {
    // Arrange
    (matchHistoryProvider.getHeadToHead as any).mockResolvedValue([]);

    // Act / Assert
    await expect(getH2HStats('Ajax', 'Ajax', new Date('2099-01-01T00:00:00Z'))).rejects.toThrow(
      'teamAId and teamBId must be different'
    );
    expect(matchHistoryProvider.getHeadToHead).not.toHaveBeenCalled();
  });

  // Test 18 — Team isolation
  it('should ignore a match involving neither Team A nor Team B', async () => {
    // Arrange
    (matchHistoryProvider.getHeadToHead as any).mockResolvedValue([
      createMatch('m1', 'Ajax', 'Phoenix', 3, 1), // real H2H
      createMatch('m2', 'Micasa', 'Rapid', 5, 3), // neither Ajax nor Phoenix
      createMatch('m3', 'Ajax', 'Micasa', 2, 1), // only Ajax, not both
      createMatch('m4', 'Phoenix', 'Rapid', 4, 2), // only Phoenix, not both
    ]);

    // Act
    const result = await getH2HStats('Ajax', 'Phoenix', new Date('2099-01-01T00:00:00Z'));

    // Assert
    expect(result.matches).toBe(1);
    expect(result.teamAGoals).toBe(3);
    expect(result.teamBGoals).toBe(1);
  });

  // Test 19 — Mixed home/away regression
  it('should handle mixed home/away H2H correctly', async () => {
    // Arrange: Ajax vs Phoenix 3-1, Phoenix vs Ajax 2-0, Ajax vs Phoenix 1-1, Phoenix vs Ajax 0-2
    (matchHistoryProvider.getHeadToHead as any).mockResolvedValue([
      createMatch('m1', 'Ajax', 'Phoenix', 3, 1),
      createMatch('m2', 'Phoenix', 'Ajax', 2, 0),
      createMatch('m3', 'Ajax', 'Phoenix', 1, 1),
      createMatch('m4', 'Phoenix', 'Ajax', 0, 2),
    ]);

    // Act
    const result = await getH2HStats('Ajax', 'Phoenix', new Date('2099-01-01T00:00:00Z'));

    // Assert
    expect(result.matches).toBe(4);
    expect(result.teamAWins).toBe(2); // m1 (3-1), m4 (2-0 away)
    expect(result.draws).toBe(1); // m3 (1-1)
    expect(result.teamBWins).toBe(1); // m2 (2-0)
    expect(result.teamAGoals).toBe(6); // 3 + 0 + 1 + 2
    expect(result.teamBGoals).toBe(4); // 1 + 2 + 1 + 0
  });

  // Test 20 — Symmetry perspective
  it('should return symmetric results when swapping Team A and Team B', async () => {
    // Arrange
    (matchHistoryProvider.getHeadToHead as any).mockResolvedValue([
      createMatch('m1', 'Ajax', 'Phoenix', 3, 1), // Ajax win
      createMatch('m2', 'Phoenix', 'Ajax', 2, 0), // Phoenix win
      createMatch('m3', 'Ajax', 'Phoenix', 1, 1), // draw
    ]);

    // Act
    const ajaxView = await getH2HStats('Ajax', 'Phoenix', new Date('2099-01-01T00:00:00Z'));
    const phoenixView = await getH2HStats('Phoenix', 'Ajax', new Date('2099-01-01T00:00:00Z'));

    // Assert: symmetry relationships
    expect(ajaxView.matches).toBe(phoenixView.matches);

    expect(ajaxView.teamAWins).toBe(phoenixView.teamBWins);
    expect(ajaxView.teamBWins).toBe(phoenixView.teamAWins);
    expect(ajaxView.draws).toBe(phoenixView.draws);

    expect(ajaxView.teamAGoals).toBe(phoenixView.teamBGoals);
    expect(ajaxView.teamBGoals).toBe(phoenixView.teamAGoals);

    expect(ajaxView.teamAGoalsPerMatch).toBeCloseTo(phoenixView.teamBGoalsPerMatch);
    expect(ajaxView.teamBGoalsPerMatch).toBeCloseTo(phoenixView.teamAGoalsPerMatch);

    expect(ajaxView.teamAWinRate).toBeCloseTo(phoenixView.teamBWinRate);
    expect(ajaxView.teamBWinRate).toBeCloseTo(phoenixView.teamAWinRate);
    expect(ajaxView.drawRate).toBeCloseTo(phoenixView.drawRate);

    expect(ajaxView.averageTotalGoals).toBeCloseTo(phoenixView.averageTotalGoals);
  });
});