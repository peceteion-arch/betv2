import { getBasicTeamStats } from './team-basic-stats.features';
import { getTeamFormStats } from './team-form.features';
import { getTeamHomeAwayStats } from './team-home-away.features';
import { TeamProfile } from './team-profile.types';
import { isMatchEligible } from './match-eligibility.utils';
import { matchHistoryProvider } from '../providers/match-history.provider';
import { calculateScoreDistribution } from './score-distribution.utils';

/**
 * Aggregates various statistics for a given team into a single profile.
 * Executes calculation functions in parallel for performance.
 */
export async function getTeamProfile(teamId: string, asOf: Date): Promise<TeamProfile> {
  const [basicStats, form, homeAway, allMatches] = await Promise.all([
    getBasicTeamStats(teamId, asOf),
    getTeamFormStats(teamId, asOf),
    getTeamHomeAwayStats(teamId, asOf),
    matchHistoryProvider.getTeamMatches(teamId, asOf),
  ]);

  const eligibleMatches = allMatches.filter((match) => isMatchEligible(match, asOf));

  const scoreDistribution = calculateScoreDistribution(
    eligibleMatches
      .filter(match => match.homeTeamId === teamId || match.awayTeamId === teamId)
      .map(match => ({
        goalsFor: match.homeTeamId === teamId ? match.homeScore : match.awayScore,
        goalsAgainst: match.homeTeamId === teamId ? match.awayScore : match.homeScore,
      }))
  );

  return {
    teamId,
    basicStats,
    form,
    homeAway,
    scoreDistribution,
  };
}
