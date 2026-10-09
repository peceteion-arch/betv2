import { matchHistoryProvider } from '../providers/match-history.provider';
import { NormalizedMatch } from '../providers/match-history.types';
import { BasicTeamStats } from './team-basic-stats.types';

export async function getBasicTeamStats(teamId: string, asOf: Date): Promise<BasicTeamStats> {
  // Temporal cutoff documented: only matches with matchDate < asOf are considered.
  const allMatches = await matchHistoryProvider.getTeamMatches(teamId, asOf);

  // Filter eligible matches: FINISHED, both scores not null, and date < asOf
  const eligibleMatches = allMatches.filter(
    (match) =>
      match.status === 'FINISHED' &&
      match.homeScore !== null &&
      match.awayScore !== null &&
      match.matchDate < asOf
  );

  // Initialize counters
  let matches = 0;
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let points = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  let cleanSheets = 0;
  let failedToScore = 0;
  let bttsYes = 0;
  let over15 = 0;
  let over25 = 0;
  let over35 = 0;

  for (const match of eligibleMatches) {
    // Determine if team is home or away
    const isHome = match.homeTeamId === teamId;
    const teamGoalsFor = isHome ? match.homeScore! : match.awayScore!;
    const teamGoalsAgainst = isHome ? match.awayScore! : match.homeScore!;

    // Update goals
    goalsFor += teamGoalsFor;
    goalsAgainst += teamGoalsAgainst;

    // Determine result
    if (teamGoalsFor > teamGoalsAgainst) {
      wins++;
      points += 3;
    } else if (teamGoalsFor === teamGoalsAgainst) {
      draws++;
      points += 1;
    } else {
      losses++;
    }

    // Clean sheet
    if (teamGoalsAgainst === 0) {
      cleanSheets++;
    }

    // Failed to score
    if (teamGoalsFor === 0) {
      failedToScore++;
    }

    // BTTS
    if (teamGoalsFor > 0 && teamGoalsAgainst > 0) {
      bttsYes++;
    }

    // Over/Under
    const totalGoals = teamGoalsFor + teamGoalsAgainst;
    if (totalGoals >= 2) over15++;
    if (totalGoals >= 3) over25++;
    if (totalGoals >= 4) over35++;

    matches++;
  }

  // Calculate derived stats, guarding against division by zero
  const pointsPerMatch = matches > 0 ? points / matches : 0;
  const goalsForPerMatch = matches > 0 ? goalsFor / matches : 0;
  const goalsAgainstPerMatch = matches > 0 ? goalsAgainst / matches : 0;
  const goalDifference = goalsFor - goalsAgainst;
  const goalDifferencePerMatch = matches > 0 ? goalDifference / matches : 0;
  const cleanSheetRate = matches > 0 ? cleanSheets / matches : 0;
  const failedToScoreRate = matches > 0 ? failedToScore / matches : 0;
  const bttsRate = matches > 0 ? bttsYes / matches : 0;
  const over15Rate = matches > 0 ? over15 / matches : 0;
  const over25Rate = matches > 0 ? over25 / matches : 0;
  const over35Rate = matches > 0 ? over35 / matches : 0;

  return {
    teamId,
    matches,
    wins,
    draws,
    losses,
    points,
    pointsPerMatch,
    goalsFor,
    goalsAgainst,
    goalDifference,
    goalsForPerMatch,
    goalsAgainstPerMatch,
    goalDifferencePerMatch,
    cleanSheets,
    cleanSheetRate,
    failedToScore,
    failedToScoreRate,
    bttsYes,
    bttsRate,
    over15,
    over15Rate,
    over25,
    over25Rate,
    over35,
    over35Rate,
  };
}