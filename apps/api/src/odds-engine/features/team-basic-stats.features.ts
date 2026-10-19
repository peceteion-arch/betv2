import { matchHistoryProvider } from '../providers/match-history.provider';
import { isMatchEligible } from './match-eligibility.utils';
import { summarizeMatches } from './team-stats.utils';
import { BasicTeamStats } from './team-basic-stats.types';

export async function getBasicTeamStats(teamId: string, asOf: Date): Promise<BasicTeamStats> {
  const allMatches = await matchHistoryProvider.getTeamMatches(teamId, asOf);
  const eligibleMatches = allMatches.filter((match) => isMatchEligible(match, asOf));

  return {
    teamId,
    ...summarizeMatches(eligibleMatches, teamId),
  };
}
