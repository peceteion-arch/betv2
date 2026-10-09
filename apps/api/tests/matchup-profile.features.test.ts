import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMatchupProfile } from '../src/odds-engine/features/matchup-profile.features';
import * as teamProfileFeatures from '../src/odds-engine/features/team-profile.features';
import * as h2hStatsFeatures from '../src/odds-engine/features/h2h-stats.features';

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

  const mockTeamProfile = (teamId: string) => ({
    teamId,
    basicStats: {
      matches: 10,
      wins: 5,
      draws: 2,
      losses: 3,
      goalsFor: 15,
      goalsAgainst: 10,
      goalsPerMatch: 1.5,
      goalsAgainstPerMatch: 1.0,
      cleanSheets: 4,
      failedToScore: 2,
      winRate: 0.5,
    },
    form: {
      last3: { matches: 3, wins: 2, draws: 1, losses: 0, goalsFor: 5, goalsAgainst: 2, points: 7, winRate: 0.66, ppg: 2.33 },
      last5: { matches: 5, wins: 3, draws: 1, losses: 1, goalsFor: 8, goalsAgainst: 4, points: 10, winRate: 0.6, ppg: 2.0 },
      last10: { matches: 10, wins: 5, draws: 2, losses: 3, goalsFor: 15, goalsAgainst: 10, points: 17, winRate: 0.5, ppg: 1.7 },
    },
    homeAway: {
      home: { matches: 5, wins: 3, draws: 1, losses: 1, goalsFor: 10, goalsAgainst: 5, winRate: 0.6, goalsPerMatch: 2.0 },
      away: { matches: 5, wins: 2, draws: 1, losses: 2, goalsFor: 5, goalsAgainst: 5, winRate: 0.4, goalsPerMatch: 1.0 },
    },
  });

  const mockH2HStats = (teamAId: string, teamBId: string) => ({
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
      if (id === teamAId) return profileA as any;
      if (id === teamBId) return profileB as any;
      throw new Error('Unexpected ID');
    });
    vi.mocked(h2hStatsFeatures.getH2HStats).mockResolvedValue(h2h as any);

    const result = await getMatchupProfile(teamAId, teamBId);

    expect(result.teamA).toEqual(profileA);
    expect(result.teamB).toEqual(profileB);
    expect(result.h2h).toEqual(h2h);
    expect(teamProfileFeatures.getTeamProfile).toHaveBeenCalledWith(teamAId);
    expect(teamProfileFeatures.getTeamProfile).toHaveBeenCalledWith(teamBId);
    expect(h2hStatsFeatures.getH2HStats).toHaveBeenCalledWith(teamAId, teamBId);
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
    vi.mocked(h2hStatsFeatures.getH2HStats).mockResolvedValue(mockH2HStats(teamAId, teamBId) as any);

    await expect(getMatchupProfile(teamAId, teamBId)).rejects.toThrow('Profile failure');
  });

  it('should propagate errors from getH2HStats', async () => {
    const teamAId = 'TeamA';
    const teamBId = 'TeamB';

    vi.mocked(teamProfileFeatures.getTeamProfile).mockResolvedValue(mockTeamProfile(teamAId) as any);
    vi.mocked(h2hStatsFeatures.getH2HStats).mockRejectedValue(new Error('H2H failure'));

    await expect(getMatchupProfile(teamAId, teamBId)).rejects.toThrow('H2H failure');
  });

  it('should handle teams with no history correctly (returning zero-stats profiles)', async () => {
    const teamAId = 'NewTeamA';
    const teamBId = 'NewTeamB';

    const zeroProfile = (teamId: string) => ({
      teamId,
      basicStats: { matches: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalsPerMatch: 0, goalsAgainstPerMatch: 0, cleanSheets: 0, failedToScore: 0, winRate: 0 },
      form: {
        last3: { matches: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0, winRate: 0, ppg: 0 },
        last5: { matches: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0, winRate: 0, ppg: 0 },
        last10: { matches: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0, winRate: 0, ppg: 0 },
      },
      homeAway: {
        home: { matches: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, winRate: 0, goalsPerMatch: 0 },
        away: { matches: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, winRate: 0, goalsPerMatch: 0 },
      },
    });

    const zeroH2H = {
      teamAId,
      teamBId,
      matches: 0,
      teamAWins: 0,
      draws: 0,
      teamBWins: 0,
      teamAGoals: 0,
      teamBGoals: 0,
      teamAGoalsPerMatch: 0,
      teamBGoalsPerMatch: 0,
      teamAWinRate: 0,
      drawRate: 0,
      teamBWinRate: 0,
      averageTotalGoals: 0,
    };

    vi.mocked(teamProfileFeatures.getTeamProfile).mockImplementation(async (id) => zeroProfile(id) as any);
    vi.mocked(h2hStatsFeatures.getH2HStats).mockResolvedValue(zeroH2H as any);

    const result = await getMatchupProfile(teamAId, teamBId);

    expect(result.teamA.basicStats.matches).toBe(0);
    expect(result.teamB.basicStats.matches).toBe(0);
    expect(result.h2h.matches).toBe(0);
  });
});
