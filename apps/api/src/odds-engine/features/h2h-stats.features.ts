import { matchHistoryProvider } from '../providers/match-history.provider';
import { NormalizedMatch } from '../providers/match-history.types';
import { H2HStats } from './h2h-stats.types';

export async function getH2HStats(
  teamAId: string,
  teamBId: string
): Promise<H2HStats> {
  if (teamAId === teamBId) {
    throw new Error('teamAId and teamBId must be different');
  }

  const allMatches = await matchHistoryProvider.getHeadToHead(teamAId, teamBId);

  // Filter eligible matches: FINISHED and both scores not null
  const eligibleMatches = allMatches.filter(
    (match) =>
      match.status === 'FINISHED' &&
      match.homeScore !== null &&
      match.awayScore !== null
  );

  // Initialize counters
  let matches = 0;
  let teamAWins = 0;
  let draws = 0;
  let teamBWins = 0;
  let teamAGoals = 0;
  let teamBGoals = 0;

  for (const match of eligibleMatches) {
    // Team isolation protection: ensure the match actually contains both teams.
    // The provider should already guarantee this, but we verify defensively.
    const isValidH2HMatch =
      (match.homeTeamId === teamAId && match.awayTeamId === teamBId) ||
      (match.homeTeamId === teamBId && match.awayTeamId === teamAId);

    if (!isValidH2HMatch) {
      continue;
    }

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
  const teamAGoalsPerMatch = matches > 0 ? teamAGoals / matches : 0;
  const teamBGoalsPerMatch = matches > 0 ? teamBGoals / matches : 0;
  const teamAWinRate = matches > 0 ? teamAWins / matches : 0;
  const drawRate = matches > 0 ? draws / matches : 0;
  const teamBWinRate = matches > 0 ? teamBWins / matches : 0;
  const averageTotalGoals = matches > 0 ? (teamAGoals + teamBGoals) / matches : 0;

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
  };
}