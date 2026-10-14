import { matchHistoryProvider } from '../providers/match-history.provider';
import { NormalizedMatch } from '../providers/match-history.types';
import { BasicTeamStats } from './team-basic-stats.types';
import { TeamHomeAwayStats } from './team-home-away.types';
import { isMatchEligible } from './match-eligibility.utils';

/**
 * Calculates statistics for a team specifically for matches where they were the HOME team.
 * This implementation replicates the exact logic used in getBasicTeamStats to ensure consistency.
 */
function calculateVenueStats(matches: NormalizedMatch[], teamId: string): BasicTeamStats {
  let matchesCount = 0;
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

  for (const match of matches) {
    const isHome = match.homeTeamId === teamId;
    const teamGoalsFor = isHome ? match.homeScore! : match.awayScore!;
    const teamGoalsAgainst = isHome ? match.awayScore! : match.homeScore!;

    goalsFor += teamGoalsFor;
    goalsAgainst += teamGoalsAgainst;

    if (teamGoalsFor > teamGoalsAgainst) {
      wins++;
      points += 3;
    } else if (teamGoalsFor === teamGoalsAgainst) {
      draws++;
      points += 1;
    } else {
      losses++;
    }

    if (teamGoalsAgainst === 0) {
      cleanSheets++;
    }

    if (teamGoalsFor === 0) {
      failedToScore++;
    }

    if (teamGoalsFor > 0 && teamGoalsAgainst > 0) {
      bttsYes++;
    }

    const totalGoals = teamGoalsFor + teamGoalsAgainst;
    if (totalGoals >= 2) over15++;
    if (totalGoals >= 3) over25++;
    if (totalGoals >= 4) over35++;

    matchesCount++;
  }

  const pointsPerMatch = matchesCount > 0 ? points / matchesCount : null;
  const goalsForPerMatch = matchesCount > 0 ? goalsFor / matchesCount : null;
  const goalsAgainstPerMatch = matchesCount > 0 ? goalsAgainst / matchesCount : null;
  const goalDifference = goalsFor - goalsAgainst;
  const goalDifferencePerMatch = matchesCount > 0 ? goalDifference / matchesCount : null;
  const cleanSheetRate = matchesCount > 0 ? cleanSheets / matchesCount : null;
  const failedToScoreRate = matchesCount > 0 ? failedToScore / matchesCount : null;
  const bttsRate = matchesCount > 0 ? bttsYes / matchesCount : null;
  const over15Rate = matchesCount > 0 ? over15 / matchesCount : null;
  const over25Rate = matchesCount > 0 ? over25 / matchesCount : null;
  const over35Rate = matchesCount > 0 ? over35 / matchesCount : null;

  return {
    teamId,
    matches: matchesCount,
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

/**
 * Computes Home and Away statistics for a given team by partitioning their match history.
 */
export async function getTeamHomeAwayStats(teamId: string, asOf: Date): Promise<TeamHomeAwayStats> {
  const allMatches = await matchHistoryProvider.getTeamMatches(teamId, asOf);

  const eligibleMatches = allMatches.filter((match) => isMatchEligible(match, asOf));

  const homeMatches = eligibleMatches.filter((m) => m.homeTeamId === teamId);
  const awayMatches = eligibleMatches.filter((m) => m.awayTeamId === teamId);

  return {
    teamId,
    home: calculateVenueStats(homeMatches, teamId),
    away: calculateVenueStats(awayMatches, teamId),
  };
}
