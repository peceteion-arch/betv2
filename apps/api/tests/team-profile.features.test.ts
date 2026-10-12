import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTeamProfile } from '../src/odds-engine/features/team-profile.features';
import { getBasicTeamStats } from '../src/odds-engine/features/team-basic-stats.features';
import { getTeamFormStats } from '../src/odds-engine/features/team-form.features';
import { getTeamHomeAwayStats } from '../src/odds-engine/features/team-home-away.features';
import { matchHistoryProvider } from '../src/odds-engine/providers/match-history.provider';
import { BasicTeamStats } from '../src/odds-engine/features/team-basic-stats.types';
import { TeamFormStats } from '../src/odds-engine/features/team-form.types';
import { TeamHomeAwayStats } from '../src/odds-engine/features/team-home-away.types';

vi.mock('../src/odds-engine/features/team-basic-stats.features');
vi.mock('../src/odds-engine/features/team-form.features');
vi.mock('../src/odds-engine/features/team-home-away.features');
vi.mock('../src/odds-engine/providers/match-history.provider');

describe('getTeamProfile', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const teamId = 'test-team';

  // Mock-uri pentru statistici
  const mockBasicStats: BasicTeamStats = {
    teamId,
    matches: 10,
    wins: 5, draws: 2, losses: 3, points: 17, pointsPerMatch: 1.7,
    goalsFor: 20, goalsAgainst: 10, goalDifference: 10,
    goalsForPerMatch: 2, goalsAgainstPerMatch: 1, goalDifferencePerMatch: 1,
    cleanSheets: 4, cleanSheetRate: 0.4, failedToScore: 2, failedToScoreRate: 0.2,
    bttsYes: 4, bttsRate: 0.4, over15: 8, over15Rate: 0.8, over25: 5, over25Rate: 0.5, over35: 2, over35Rate: 0.2
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

  function createMatch(id: string, home: string, away: string, homeScore: number, awayScore: number) {
    return {
      matchId: id, homeTeamId: home, awayTeamId: away, homeTeamName: home, awayTeamName: away,
      competitionId: 'c1', matchday: 1, matchDate: new Date('2026-09-01'), status: 'FINISHED', homeScore, awayScore
    };
  }

  it('should compute score distribution correctly', async () => {
    vi.mocked(getBasicTeamStats).mockResolvedValue(mockBasicStats);
    vi.mocked(getTeamFormStats).mockResolvedValue(mockFormStats);
    vi.mocked(getTeamHomeAwayStats).mockResolvedValue(mockHomeAwayStats);

    // Un meci acasă, unul deplasare, unul străin
    vi.mocked(matchHistoryProvider.getTeamMatches).mockResolvedValue([
      createMatch('m1', teamId, 'Other', 2, 0),
      createMatch('m2', 'Other', teamId, 1, 3),
      createMatch('m3', 'Other1', 'Other2', 0, 0)
    ]);

    const profile = await getTeamProfile(teamId, new Date('2099-01-01T00:00:00Z'));

    expect(profile.scoreDistribution.matchesTotal).toBe(2);
    // Perspectiva echipei: m1 (2-0 acasă -> 2 goluriFor, 0 goalsAgainst), m2 (1-3 deplasare -> 3 goluriFor, 1 goalsAgainst)
    expect(profile.scoreDistribution.scorelines).toContainEqual({ goalsFor: 2, goalsAgainst: 0, count: 1, rate: 0.5 });
    expect(profile.scoreDistribution.scorelines).toContainEqual({ goalsFor: 3, goalsAgainst: 1, count: 1, rate: 0.5 });
  });

  it('should handle zero matches for score distribution', async () => {
    vi.mocked(getBasicTeamStats).mockResolvedValue(mockBasicStats);
    vi.mocked(getTeamFormStats).mockResolvedValue(mockFormStats);
    vi.mocked(getTeamHomeAwayStats).mockResolvedValue(mockHomeAwayStats);
    vi.mocked(matchHistoryProvider.getTeamMatches).mockResolvedValue([]);

    const profile = await getTeamProfile(teamId, new Date('2099-01-01T00:00:00Z'));

    expect(profile.scoreDistribution.matchesTotal).toBe(0);
    expect(profile.scoreDistribution.scorelines).toEqual([]);
  });
});
