import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMatchupProfile } from '../src/odds-engine/features/matchup-profile.features';
import * as teamProfileFeatures from '../src/odds-engine/features/team-profile.features';
import * as h2hStatsFeatures from '../src/odds-engine/features/h2h-stats.features';
import { TeamProfile } from '../src/odds-engine/features/team-profile.types';
import { H2HStats } from '../src/odds-engine/features/h2h-stats.types';

vi.mock('../src/odds-engine/features/team-profile.features', () => ({
  getTeamProfile: vi.fn(),
}));

vi.mock('../src/odds-engine/features/h2h-stats.features', () => ({
  getH2HStats: vi.fn(),
}));

describe('getMatchupProfile', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const createMockBasicStats = (teamId: string) => ({
    teamId,
    matches: 10,
    wins: 5,
    draws: 2,
    losses: 3,
    points: 17,
    pointsPerMatch: 1.7,
    goalsFor: 15,
    goalsAgainst: 10,
    goalDifference: 5,
    goalsForPerMatch: 1.5,
    goalsAgainstPerMatch: 1.0,
    goalDifferencePerMatch: 0.5,
    cleanSheets: 4,
    cleanSheetRate: 0.4,
    failedToScore: 2,
    failedToScoreRate: 0.2,
    bttsYes: 6,
    bttsRate: 0.6,
    over15: 8,
    over15Rate: 0.8,
    over25: 5,
    over25Rate: 0.5,
    over35: 2,
    over35Rate: 0.2,
  });

  const createMockFormWindow = () => ({
    matches: 3, wins: 2, draws: 1, losses: 0, points: 7, pointsPerMatch: 2.33,
    goalsFor: 5, goalsAgainst: 2, goalDifference: 3, goalsForPerMatch: 1.66, goalsAgainstPerMatch: 0.66, goalDifferencePerMatch: 1,
    cleanSheets: 1, cleanSheetRate: 0.33, failedToScore: 0, failedToScoreRate: 0, bttsYes: 1, bttsRate: 0.33,
    over15: 2, over15Rate: 0.66, over25: 1, over25Rate: 0.33, over35: 0, over35Rate: 0
  });

  const mockTeamProfile = (teamId: string): TeamProfile => ({
    teamId,
    basicStats: createMockBasicStats(teamId),
    form: {
      last3: createMockFormWindow(),
      last5: createMockFormWindow(),
      last10: createMockFormWindow(),
    },
    homeAway: {
      teamId,
      home: createMockBasicStats(teamId),
      away: createMockBasicStats(teamId),
    },
  });

  const mockH2HStats = (teamAId: string, teamBId: string): H2HStats => ({
    teamAId,
    teamBId,
    matches: 2,
    teamAWins: 1,
    draws: 1,
    teamBWins: 0,
    teamAGoals: 3,
    teamBGoals: 1,
    teamAGoalsPerMatch: 1.5,
    teamBGoalsPerMatch: 0.5,
    teamAWinRate: 0.5,
    drawRate: 0.5,
    teamBWinRate: 0,
    averageTotalGoals: 2.0,
  });

  it('should aggregate team profiles and H2H stats correctly', async () => {
    const teamAId = 'TeamA';
    const teamBId = 'TeamB';
    const profileA = mockTeamProfile(teamAId);
    const profileB = mockTeamProfile(teamBId);
    const h2h = mockH2HStats(teamAId, teamBId);

    vi.mocked(teamProfileFeatures.getTeamProfile).mockImplementation(async (id) => {
      if (id === teamAId) return profileA;
      if (id === teamBId) return profileB;
      throw new Error('Unexpected ID');
    });
    vi.mocked(h2hStatsFeatures.getH2HStats).mockResolvedValue(h2h);

    const result = await getMatchupProfile(teamAId, teamBId);

    expect(result.teamA).toEqual(profileA);
    expect(result.teamB).toEqual(profileB);
    expect(result.h2h).toEqual(h2h);
  });

  it('should reject identical team IDs before calling other functions', async () => {
    const teamId = 'SameTeam';

    await expect(getMatchupProfile(teamId, teamId)).rejects.toThrow(
      'teamAId and teamBId must be different'
    );

    expect(teamProfileFeatures.getTeamProfile).not.toHaveBeenCalled();
    expect(h2hStatsFeatures.getH2HStats).not.toHaveBeenCalled();
  });

  it('should propagate errors from getTeamProfile', async () => {
    const teamAId = 'TeamA';
    const teamBId = 'TeamB';

    vi.mocked(teamProfileFeatures.getTeamProfile).mockRejectedValue(new Error('Profile failure'));
    vi.mocked(h2hStatsFeatures.getH2HStats).mockResolvedValue(mockH2HStats(teamAId, teamBId));

    await expect(getMatchupProfile(teamAId, teamBId)).rejects.toThrow('Profile failure');
  });

  it('should propagate errors from getH2HStats', async () => {
    const teamAId = 'TeamA';
    const teamBId = 'TeamB';

    vi.mocked(teamProfileFeatures.getTeamProfile).mockResolvedValue(mockTeamProfile(teamAId));
    vi.mocked(h2hStatsFeatures.getH2HStats).mockRejectedValue(new Error('H2H failure'));

    await expect(getMatchupProfile(teamAId, teamBId)).rejects.toThrow('H2H failure');
  });

  it('should handle teams with no history correctly', async () => {
    const teamAId = 'NewTeamA';
    const teamBId = 'NewTeamB';

    const createZeroStats = (teamId: string) => ({
      teamId,
      matches: 0, wins: 0, draws: 0, losses: 0, points: 0, pointsPerMatch: 0,
      goalsFor: 0, goalsAgainst: 0, goalDifference: 0, goalsForPerMatch: 0, goalsAgainstPerMatch: 0, goalDifferencePerMatch: 0,
      cleanSheets: 0, cleanSheetRate: 0, failedToScore: 0, failedToScoreRate: 0, bttsYes: 0, bttsRate: 0,
      over15: 0, over15Rate: 0, over25: 0, over25Rate: 0, over35: 0, over35Rate: 0,
    });

    const zeroProfile = (teamId: string): TeamProfile => ({
      teamId,
      basicStats: createZeroStats(teamId),
      form: {
        last3: { ...createZeroStats(teamId), matches: 0 },
        last5: { ...createZeroStats(teamId), matches: 0 },
        last10: { ...createZeroStats(teamId), matches: 0 },
      },
      homeAway: {
        teamId,
        home: createZeroStats(teamId),
        away: createZeroStats(teamId),
      },
    });

    const zeroH2H: H2HStats = {
      teamAId, teamBId, matches: 0, teamAWins: 0, draws: 0, teamBWins: 0,
      teamAGoals: 0, teamBGoals: 0, teamAGoalsPerMatch: 0, teamBGoalsPerMatch: 0,
      teamAWinRate: 0, drawRate: 0, teamBWinRate: 0, averageTotalGoals: 0,
    };

    vi.mocked(teamProfileFeatures.getTeamProfile).mockImplementation(async (id) => zeroProfile(id));
    vi.mocked(h2hStatsFeatures.getH2HStats).mockResolvedValue(zeroH2H);

    const result = await getMatchupProfile(teamAId, teamBId);

    expect(result.teamA.basicStats.matches).toBe(0);
    expect(result.teamB.basicStats.matches).toBe(0);
    expect(result.h2h.matches).toBe(0);
  });
});
