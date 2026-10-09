import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTeamProfile } from '../src/odds-engine/features/team-profile.features';
import { getBasicTeamStats } from '../src/odds-engine/features/team-basic-stats.features';
import { getTeamFormStats } from '../src/odds-engine/features/team-form.features';
import { getTeamHomeAwayStats } from '../src/odds-engine/features/team-home-away.features';
import { BasicTeamStats } from '../src/odds-engine/features/team-basic-stats.types';
import { TeamFormStats } from '../src/odds-engine/features/team-form.types';
import { TeamHomeAwayStats } from '../src/odds-engine/features/team-home-away.types';

vi.mock('../src/odds-engine/features/team-basic-stats.features');
vi.mock('../src/odds-engine/features/team-form.features');
vi.mock('../src/odds-engine/features/team-home-away.features');

describe('getTeamProfile', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const teamId = 'test-team';

  const mockBasicStats: BasicTeamStats = {
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

  const mockFormStats: TeamFormStats = {
    teamId,
    last3: { matches: 3, wins: 2, draws: 1, losses: 0, points: 7, pointsPerMatch: 2.33, goalsFor: 5, goalsAgainst: 2, goalDifference: 3, goalsForPerMatch: 1.66, goalsAgainstPerMatch: 0.66, goalDifferencePerMatch: 1, cleanSheets: 1, cleanSheetRate: 0.33, failedToScore: 0, failedToScoreRate: 0, bttsYes: 1, bttsRate: 0.33, over15: 2, over15Rate: 0.66, over25: 1, over25Rate: 0.33, over35: 0, over35Rate: 0 },
    last5: { matches: 5, wins: 3, draws: 1, losses: 1, points: 10, pointsPerMatch: 2, goalsFor: 8, goalsAgainst: 4, goalDifference: 4, goalsForPerMatch: 1.6, goalsAgainstPerMatch: 0.8, goalDifferencePerMatch: 0.8, cleanSheets: 2, cleanSheetRate: 0.4, failedToScore: 1, failedToScoreRate: 0.2, bttsYes: 2, bttsRate: 0.4, over15: 4, over15Rate: 0.8, over25: 2, over25Rate: 0.4, over35: 1, over35Rate: 0.2 },
    last10: { matches: 10, wins: 5, draws: 2, losses: 3, points: 17, pointsPerMatch: 1.7, goalsFor: 20, goalsAgainst: 10, goalDifference: 10, goalsForPerMatch: 2, goalsAgainstPerMatch: 1, goalDifferencePerMatch: 1, cleanSheets: 4, cleanSheetRate: 0.4, failedToScore: 2, failedToScoreRate: 0.2, bttsYes: 4, bttsRate: 0.4, over15: 8, over15Rate: 0.8, over25: 5, over25Rate: 0.5, over35: 2, over35Rate: 0.2 },
  };

  const mockHomeAwayStats: TeamHomeAwayStats = {
    teamId,
    home: { matches: 5, wins: 3, draws: 1, losses: 1, points: 10, pointsPerMatch: 2, goalsFor: 10, goalsAgainst: 4, goalDifference: 6, goalsForPerMatch: 2, goalsAgainstPerMatch: 0.8, goalDifferencePerMatch: 1.2, cleanSheets: 2, cleanSheetRate: 0.4, failedToScore: 1, failedToScoreRate: 0.2, bttsYes: 2, bttsRate: 0.4, over15: 4, over15Rate: 0.8, over25: 2, over25Rate: 0.4, over35: 1, over35Rate: 0.2 },
    away: { matches: 5, wins: 2, draws: 1, losses: 2, points: 7, pointsPerMatch: 1.4, goalsFor: 10, goalsAgainst: 6, goalDifference: 4, goalsForPerMatch: 2, goalsAgainstPerMatch: 1.2, goalDifferencePerMatch: 0.8, cleanSheets: 2, cleanSheetRate: 0.4, failedToScore: 1, failedToScoreRate: 0.2, bttsYes: 2, bttsRate: 0.4, over15: 4, over15Rate: 0.8, over25: 3, over25Rate: 0.6, over35: 1, over35Rate: 0.2 },
  };

  it('should aggregate all statistics correctly', async () => {
    vi.mocked(getBasicTeamStats).mockResolvedValue(mockBasicStats);
    vi.mocked(getTeamFormStats).mockResolvedValue(mockFormStats);
    vi.mocked(getTeamHomeAwayStats).mockResolvedValue(mockHomeAwayStats);

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
    vi.mocked(getTeamFormStats).mockResolvedValue(mockFormStats);
    vi.mocked(getTeamHomeAwayStats).mockResolvedValue(mockHomeAwayStats);

    await expect(getTeamProfile(teamId)).rejects.toThrow('Database error');
  });

  it('should aggregate statistics correctly for a team with no history', async () => {
    const zeroStats: BasicTeamStats = {
      teamId,
      matches: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
      pointsPerMatch: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      goalsForPerMatch: 0,
      goalsAgainstPerMatch: 0,
      goalDifferencePerMatch: 0,
      cleanSheets: 0,
      cleanSheetRate: 0,
      failedToScore: 0,
      failedToScoreRate: 0,
      bttsYes: 0,
      bttsRate: 0,
      over15: 0,
      over15Rate: 0,
      over25: 0,
      over25Rate: 0,
      over35: 0,
      over35Rate: 0,
    };
    const zeroFormStats: TeamFormStats = {
      teamId,
      last3: { ...zeroStats, matches: 0 },
      last5: { ...zeroStats, matches: 0 },
      last10: { ...zeroStats, matches: 0 },
    };
    const zeroHomeAwayStats: TeamHomeAwayStats = {
      teamId,
      home: zeroStats,
      away: zeroStats,
    };

    vi.mocked(getBasicTeamStats).mockResolvedValue(zeroStats);
    vi.mocked(getTeamFormStats).mockResolvedValue(zeroFormStats);
    vi.mocked(getTeamHomeAwayStats).mockResolvedValue(zeroHomeAwayStats);

    const profile = await getTeamProfile(teamId);

    expect(profile.basicStats.matches).toBe(0);
    expect(profile.form.last3.matches).toBe(0);
    expect(profile.homeAway.home.matches).toBe(0);
  });
});
