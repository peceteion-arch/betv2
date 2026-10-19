import { getTeamMatchResult } from './match-result.utils';
import type { NormalizedMatch } from '../providers/match-history.types';
import type { TeamFormWindowStats } from './team-form.types';

/**
 * Pure function that summarizes a list of matches for a given team.
 * Uses getTeamMatchResult for consistent result calculation.
 * Skips matches where getTeamMatchResult returns null (team not playing or missing scores).
 * Returns counters in the form of TeamFormWindowStats (without teamId).
 */
export function summarizeMatches(matches: NormalizedMatch[], teamId: string): TeamFormWindowStats {
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
    const result = getTeamMatchResult(match, teamId);
    if (!result) continue; // skip non-eligible or missing scores

    const { goalsFor: gf, goalsAgainst: ga, points: pts, outcome } = result;

    goalsFor += gf;
    goalsAgainst += ga;
    points += pts;

    if (outcome === 'WIN') wins++;
    else if (outcome === 'DRAW') draws++;
    else losses++;

    if (ga === 0) cleanSheets++;
    if (gf === 0) failedToScore++;
    if (gf > 0 && ga > 0) bttsYes++;

    const totalGoals = gf + ga;
    if (totalGoals >= 2) over15++;
    if (totalGoals >= 3) over25++;
    if (totalGoals >= 4) over35++;
  }

  const matchesCount = wins + draws + losses; // only matches with valid result

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