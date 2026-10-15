import { matchHistoryProvider } from '../providers/match-history.provider';
import { isMatchEligible } from './match-eligibility.utils';
import { getTeamMatchResult } from './match-result.utils';
import { NormalizedMatch } from '../providers/match-history.types';
import { BasicTeamStats } from './team-basic-stats.types';

export async function getBasicTeamStats(teamId: string, asOf: Date): Promise<BasicTeamStats> {
  // Temporal cutoff documented: only matches with matchDate < asOf are considered.
  const allMatches = await matchHistoryProvider.getTeamMatches(teamId, asOf);

  // Filter eligible matches using common eligibility rule
  const eligibleMatches = allMatches.filter((match) => isMatchEligible(match, asOf));

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
    // Rezultatul din perspectiva echipei — logica comuna (match-result.utils)
    const result = getTeamMatchResult(match, teamId);
    if (!result) continue; // echipa nu joaca in meci sau lipsesc scorurile

    const teamGoalsFor = result.goalsFor;
    const teamGoalsAgainst = result.goalsAgainst;

    goalsFor += teamGoalsFor;
    goalsAgainst += teamGoalsAgainst;
    points += result.points;

    if (result.outcome === 'WIN') wins++;
    else if (result.outcome === 'DRAW') draws++;
    else losses++;

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
  const pointsPerMatch = matches > 0 ? points / matches : null;
  const goalsForPerMatch = matches > 0 ? goalsFor / matches : null;
  const goalsAgainstPerMatch = matches > 0 ? goalsAgainst / matches : null;
  const goalDifference = goalsFor - goalsAgainst;
  const goalDifferencePerMatch = matches > 0 ? goalDifference / matches : null;
  const cleanSheetRate = matches > 0 ? cleanSheets / matches : null;
  const failedToScoreRate = matches > 0 ? failedToScore / matches : null;
  const bttsRate = matches > 0 ? bttsYes / matches : null;
  const over15Rate = matches > 0 ? over15 / matches : null;
  const over25Rate = matches > 0 ? over25 / matches : null;
  const over35Rate = matches > 0 ? over35 / matches : null;

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