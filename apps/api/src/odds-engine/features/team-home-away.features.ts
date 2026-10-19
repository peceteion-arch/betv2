import { matchHistoryProvider } from '../providers/match-history.provider';
import { TeamHomeAwayStats } from './team-home-away.types';
import { isMatchEligible } from './match-eligibility.utils';
import { summarizeMatches } from './team-stats.utils';

export async function getTeamHomeAwayStats(teamId: string, asOf: Date): Promise<TeamHomeAwayStats> {
  const allMatches = await matchHistoryProvider.getTeamMatches(teamId, asOf);

  const eligibleMatches = allMatches.filter((match) => isMatchEligible(match, asOf));

  const homeMatches = eligibleMatches.filter((m) => m.homeTeamId === teamId);
  const awayMatches = eligibleMatches.filter((m) => m.awayTeamId === teamId);

  return {
    teamId,
    home: { teamId, ...summarizeMatches(homeMatches, teamId) },
    away: { teamId, ...summarizeMatches(awayMatches, teamId) },
  };
}
