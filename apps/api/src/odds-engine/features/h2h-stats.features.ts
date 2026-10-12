import { matchHistoryProvider } from '../providers/match-history.provider';
import { NormalizedMatch } from '../providers/match-history.types';
import { H2HStats } from './h2h-stats.types';
import { calculateScoreDistribution } from './score-distribution.utils';

export async function getH2HStats(
  teamAId: string,
  teamBId: string,
  asOf: Date
): Promise<H2HStats> {
  if (teamAId === teamBId) {
    throw new Error('teamAId and teamBId must be different');
  }

  const allMatches = await matchHistoryProvider.getHeadToHead(teamAId, teamBId, asOf);

  // Filter eligible matches: FINISHED, both scores not null, and strictly before asOf
  const eligibleMatches = allMatches.filter(
    (match) =>
      match.status === 'FINISHED' &&
      match.homeScore !== null &&
      match.awayScore !== null &&
      match.matchDate < asOf
  );

  // Further filter to only include matches that actually involve both teams (H2H)
  const h2hEligibleMatches = eligibleMatches.filter(
    (match) =>
      (match.homeTeamId === teamAId && match.awayTeamId === teamBId) ||
      (match.homeTeamId === teamBId && match.awayTeamId === teamAId)
  );

  // Initialize counters
  let matches = 0;
  let teamAWins = 0;
  let draws = 0;
  let teamBWins = 0;
  let teamAGoals = 0;
  let teamBGoals = 0;

  for (const match of h2hEligibleMatches) {
    // Determine goals from the perspective of Team A / Team B.
    const isTeamAHome = match.homeTeamId === teamAId;
    const teamAGoalsForThisMatch = isTeamAHome ? match.homeScore! : match.awayScore!;
    const teamBGoalsForThisMatch = isTeamAHome ? match.awayScore! : match.homeScore!;

    // Update goals
    teamAGoals += teamAGoalsForThisMatch;
    teamBGoals += teamBGoalsForThisMatch;

    // Determine result from Team A's perspective
    if (teamAGoalsForThisMatch > teamBGoalsForThisMatch) {
      teamAWins++;
    } else if (teamAGoalsForThisMatch === teamBGoalsForThisMatch) {
      draws++;
    } else {
      teamBWins++;
    }

    matches++;
  }

  // Calculate derived stats, guarding against division by zero
  const teamAGoalsPerMatch = matches > 0 ? teamAGoals / matches : null;
  const teamBGoalsPerMatch = matches > 0 ? teamBGoals / matches : null;
  const teamAWinRate = matches > 0 ? teamAWins / matches : null;
  const drawRate = matches > 0 ? draws / matches : null;
  const teamBWinRate = matches > 0 ? teamBWins / matches : null;
  const averageTotalGoals = matches > 0 ? (teamAGoals + teamBGoals) / matches : null;

  // Calculate score distribution only for eligible H2H matches (same list used for counters)
  const scoreDistribution = calculateScoreDistribution(
    h2hEligibleMatches.map((match) => {
      const isTeamAHome = match.homeTeamId === teamAId;
      return {
        goalsFor: isTeamAHome ? match.homeScore : match.awayScore,
        goalsAgainst: isTeamAHome ? match.awayScore : match.homeScore,
      };
    })
  );

  return {
    teamAId,
    teamBId,
    matches,
    teamAWins,
    draws,
    teamBWins,
    teamAGoals,
    teamBGoals,
    teamAGoalsPerMatch,
    teamBGoalsPerMatch,
    teamAWinRate,
    drawRate,
    teamBWinRate,
    averageTotalGoals,
    scoreDistribution,
  };
}