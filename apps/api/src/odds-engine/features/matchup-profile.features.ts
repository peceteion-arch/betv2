import { getTeamProfile } from './team-profile.features';
import { getH2HStats } from './h2h-stats.features';
import { MatchupProfile } from './matchup-profile.types';

/**
 * Aggregates the profiles of two teams and their head-to-head statistics.
 *
 * @param teamAId - The ID of the first team (Team A)
 * @param teamBId - The ID of the second team (Team B)
 * @returns A promise that resolves to a MatchupProfile object
 * @throws Error if teamAId and teamBId are identical
 */
export async function getMatchupProfile(
  teamAId: string,
  teamBId: string
): Promise<MatchupProfile> {
  if (teamAId === teamBId) {
    throw new Error('teamAId and teamBId must be different');
  }

  const [teamA, teamB, h2h] = await Promise.all([
    getTeamProfile(teamAId),
    getTeamProfile(teamBId),
    getH2HStats(teamAId, teamBId),
  ]);

  return {
    teamA,
    teamB,
    h2h,
  };
}
