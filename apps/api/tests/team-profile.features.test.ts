import { describe, it, expect, vi } from 'vitest';
import { getTeamProfile } from '../src/odds-engine/features/team-profile.features';
import { getBasicTeamStats } from '../src/odds-engine/features/team-basic-stats.features';
import { getTeamFormStats } from '../src/odds-engine/features/team-form.features';
import { getTeamHomeAwayStats } from '../src/odds-engine/features/team-home-away.features';

vi.mock('../src/odds-engine/features/team-basic-stats.features');
vi.mock('../src/odds-engine/features/team-form.features');
vi.mock('../src/odds-engine/features/team-home-away.features');

describe('getTeamProfile', () => {
  const teamId = 'test-team';

  const mockBasicStats = {
    teamId,
    matches: 10,
    wins: 5,
    draws: 2,
    losses: 3,
    points: 17,
    pointsPerMatch: 1.7,
    goalsFor: 20,
    goalsAgainst: 10,
    goalDifference: 10,
    goalsForPerMatch: 2,
    goalsAgainstPerMatch: 1,
    goalDifferencePerMatch: 1,
    cleanSheets: 4,
    cleanSheetRate: 0.4,
    failedToScore: 2,
    failedToScoreRate: 0.2,
    bttsYes: 4,
    bttsRate: 0.4,
    over15: 8,
    over15Rate: 0.8,
    over25: 5,
    over25Rate: 0.5,
    over35: 2,
    over35Rate: 0.2,
  };

  const mockFormStats = {
    teamId,
    last3: { matches: 3, wins: 2, draws: 1, losses: 0, points: 7, pointsPerMatch: 2.33, goalsFor: 5, goalsAgainst: 2, goalDifference: 3, goalsForPerMatch: 1.66, goalsAgainstPerMatch: 0.66, goalDifferencePerMatch: 1, cleanSheets: 1, cleanSheetRate: 0.33, failedToScore: 0, failedToScoreRate: 0, bttsYes: 1, bttsRate: 0.33, over15: 2, over15Rate: 0.66, over25: 1, over25Rate: 0.33, over35: 0, over35Rate: 0 },
    last5: { matches: 5, wins: 3, draws: 1, losses: 1, points: 10, pointsPerMatch: 2, goalsFor: 8, goalsAgainst: 4, goalDifference: 4, goalsForPerMatch: 1.6, goalsAgainstPerMatch: 0.8, goalDifferencePerMatch: 0.8, cleanSheets: 2, cleanSheetRate: 0.4, failedToScore: 1, failedToScoreRate: 0.2, bttsYes: 2, bttsRate: 0.4, over15: 4, over15Rate: 0.8, over25: 2, over25Rate: 0.4, over35: 1, over35Rate: 0.2 },
    last10: { matches: 10, wins: 5, draws: 2, losses: 3, points: 17, pointsPerMatch: 1.7, goalsFor: 20, goalsAgainst: 10, goalDifference: 10, goalsForPerMatch: 2, goalsAgainstPerMatch: 1, goalDifferencePerMatch: 1, cleanSheets: 4, cleanSheetRate: 0.4, failedToScore: 2, failedToScoreRate: 0.2, bttsYes: 4, bttsRate: 0.4, over15: 8, over15Rate: 0.8, over25: 5, over25Rate: 0.5, over35: 2, over35Rate: 0.2 },
  };

  const mockHomeAwayStats = {
    teamId,
    home: { matches: 5, wins: 3, draws: 1, losses: 1, points: 10, pointsPerMatch: 2, goalsFor: 10, goalsAgainst: 4, goalDifference: 6, goalsForPerMatch: 2, goalsAgainstPerMatch: 0.8, goalDifferencePerMatch: 1.2, cleanSheets: 2, cleanSheetRate: 0.4, failedToScore: 1, failedToScoreRate: 0.2, bttsYes: 2, bttsRate: 0.4, over15: 4, over15Rate: 0.8, over25: 2, over25Rate: 0.4, over35: 1, over35Rate: 0.2 },
    away: { matches: 5, wins: 2, draws: 1, losses: 2, points: 7, pointsPerMatch: 1.4, goalsFor: 10, goalsAgainst: 6, goalDifference: 4, goalsForPerMatch: 2, goalsAgainstPerMatch: 1.2, goalDifferencePerMatch: 0.8, cleanSheets: 2, cleanSheetRate: 0.4, failedToScore: 1, failedToScoreRate: 0.2, bttsYes: 2, bttsRate: 0.4, over15: 4, over15Rate: 0.8, over25: 3, over25Rate: 0.6, over35: 1, over35Rate: 0.2 },
  };

  it('should aggregate all statistics correctly', async () => {
    vi.mocked(getBasicTeamStats).mockResolvedValue(mockBasicStats as any);
    vi.mocked(getTeamFormStats).mockResolvedValue(mockFormStats as any);
    vi.mocked(getTeamHomeAwayStats).mockResolvedValue(mockHomeAwayStats as any);

    const profile = await getTeamProfile(teamId);

    expect(profile.teamId).toBe(teamId);
    expect(profile.basicStats).toEqual(mockBasicStats);
    expect(profile.form).toEqual(mockFormStats);
    expect(profile.homeAway).toEqual(mockHomeAwayStats);

    expect(getBasicTeamStats).toHaveBeenCalledWith(teamId);
    expect(getTeamFormStats).toHaveBeenCalledWith(teamId);
    expect(getTeamHomeAwayStats).toHaveBeenCalledWith(teamId);
  });

  it('should handle error propagation from one of the statistical functions', async () => {
    const error = new Error('Database error');
    vi.mocked(getBasicTeamStats).mockRejectedValue(error);
    vi.mocked(getTeamFormStats).mockResolvedValue(mockFormStats as any);
    vi.mocked(getTeamHomeAwayStats).mockResolvedValue(mockHomeAwayStats as any);

    await expect(getTeamProfile(teamId)).rejects.toThrow('Database error');
  });
});
