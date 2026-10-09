import { matchHistoryProvider } from '../providers/match-history.provider';
import { NormalizedMatch } from '../providers/match-history.types';
import { TeamFormStats, TeamFormWindowStats } from './team-form.types';

export async function getTeamFormStats(teamId: string, asOf: Date): Promise<TeamFormStats> {
  // Temporal cutoff: only matches before asOf are eligible for form analysis.
  const allMatches = await matchHistoryProvider.getTeamMatches(teamId, asOf);

  // 2. Filter eligible matches: status === 'FINISHED', both scores are not null, and date < asOf
  const eligibleMatches = allMatches.filter(
    (match) =>
      match.status === 'FINISHED' &&
      match.homeScore !== null &&
      match.awayScore !== null &&
      match.matchDate < asOf
  );

  // 3. Sort chronologically (oldest to newest)
  // Standard sort using matchDate first, with matchId as a deterministic tie-breaker
  eligibleMatches.sort((a, b) => {
    const dateA = new Date(a.matchDate).getTime();
    const dateB = new Date(b.matchDate).getTime();
    if (dateA !== dateB) {
      return dateA - dateB;
    }
    return a.matchId.localeCompare(b.matchId);
  });

  // 4. Select last 3 / 5 / 10 matches
  const last3Matches = eligibleMatches.slice(-3);
  const last5Matches = eligibleMatches.slice(-5);
  const last10Matches = eligibleMatches.slice(-10);

  // 5. Calculate stats for each window
  const last3 = calculateWindowStats(last3Matches, teamId);
  const last5 = calculateWindowStats(last5Matches, teamId);
  const last10 = calculateWindowStats(last10Matches, teamId);

  return {
    teamId,
    last3,
    last5,
    last10,
  };
}

function calculateWindowStats(matches: NormalizedMatch[], teamId: string): TeamFormWindowStats {
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
  }

  const matchesCount = matches.length;

  const pointsPerMatch = matchesCount > 0 ? points / matchesCount : 0;
  const goalsForPerMatch = matchesCount > 0 ? goalsFor / matchesCount : 0;
  const goalsAgainstPerMatch = matchesCount > 0 ? goalsAgainst / matchesCount : 0;
  const goalDifference = goalsFor - goalsAgainst;
  const goalDifferencePerMatch = matchesCount > 0 ? goalDifference / matchesCount : 0;
  const cleanSheetRate = matchesCount > 0 ? cleanSheets / matchesCount : 0;
  const failedToScoreRate = matchesCount > 0 ? failedToScore / matchesCount : 0;
  const bttsRate = matchesCount > 0 ? bttsYes / matchesCount : 0;
  const over15Rate = matchesCount > 0 ? over15 / matchesCount : 0;
  const over25Rate = matchesCount > 0 ? over25 / matchesCount : 0;
  const over35Rate = matchesCount > 0 ? over35 / matchesCount : 0;

  return {
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
