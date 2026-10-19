import { matchHistoryProvider } from '../providers/match-history.provider';
import { TeamFormStats } from './team-form.types';
import { isMatchEligible } from './match-eligibility.utils';
import { summarizeMatches } from './team-stats.utils';

export async function getTeamFormStats(teamId: string, asOf: Date): Promise<TeamFormStats> {
  const allMatches = await matchHistoryProvider.getTeamMatches(teamId, asOf);

  const eligibleMatches = allMatches.filter((match) => isMatchEligible(match, asOf));

  eligibleMatches.sort((a, b) => {
    const dateA = new Date(a.matchDate).getTime();
    const dateB = new Date(b.matchDate).getTime();
    if (dateA !== dateB) {
      return dateA - dateB;
    }
    return a.matchId.localeCompare(b.matchId);
  });

  const last3Matches = eligibleMatches.slice(-3);
  const last5Matches = eligibleMatches.slice(-5);
  const last10Matches = eligibleMatches.slice(-10);

  return {
    teamId,
    last3: summarizeMatches(last3Matches, teamId),
    last5: summarizeMatches(last5Matches, teamId),
    last10: summarizeMatches(last10Matches, teamId),
  };
}
