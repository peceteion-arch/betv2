import { matchHistoryProvider } from '../providers/match-history.provider';
import { NormalizedMatch } from '../providers/match-history.types';
import { ExpectedGoals, ExpectedGoalsResult } from './expected-goals.types';

const M = 5; // Constanta de temperare (Bayesian Shrinkage)

/**
 * Calculează golurile așteptate (xG) pentru gazde și oaspeți.
 */
export async function getExpectedGoals(
  homeTeamId: string,
  awayTeamId: string,
  asOf: Date
): Promise<ExpectedGoalsResult> {
  // 1. Obținem toate meciurile relevante până la asOf
  const homeMatches = await matchHistoryProvider.getTeamMatches(homeTeamId, asOf);
  const awayMatches = await matchHistoryProvider.getTeamMatches(awayTeamId, asOf);

  // 2. Filtrare meciuri eligibile (FINISHED)
  const eligibleHome = homeMatches.filter(isEligible);
  const eligibleAway = awayMatches.filter(isEligible);

  // 3. Calculăm mediile pe competiție (pentru a avea un baseline de temperare)
  // NOTĂ: În această versiune de bază, presupunem că echipele sunt în aceeași competiție
  // dacă nu, ar trebui calculat un baseline per competitionId.
  const homeStats = calculateStats(eligibleHome, homeTeamId);
  const awayStats = calculateStats(eligibleAway, awayTeamId);

  // 4. Calculăm xG cu temperare
  // Formula: (N * xG_calculat + M * MediaGlobala) / (N + M)
  // Pentru simplitate, folosim MediaGlobala = 1.4 (media standard competiție)
  const leagueMean = 1.4;

  return {
    home: applyShrinkage(homeStats, leagueMean),
    away: applyShrinkage(awayStats, leagueMean),
  };
}

function isEligible(match: NormalizedMatch): boolean {
  return (
    match.status === 'FINISHED' &&
    match.homeScore !== null &&
    match.awayScore !== null
  );
}

interface InternalStats {
  teamId: string;
  gf: number;
  ga: number;
  matches: number;
}

function calculateStats(matches: NormalizedMatch[], teamId: string): InternalStats {
  let gf = 0;
  let ga = 0;
  let count = 0;

  for (const match of matches) {
    const isHome = match.homeTeamId === teamId;
    gf += isHome ? match.homeScore! : match.awayScore!;
    ga += isHome ? match.awayScore! : match.homeScore!;
    count++;
  }
  return { teamId, gf, ga, matches: count };
}

function applyShrinkage(stats: InternalStats, leagueMean: number): ExpectedGoals {
  const n = stats.matches;
  const gf = stats.gf;
  const ga = stats.ga;

  const rawGF = n > 0 ? gf / n : leagueMean;
  const rawGA = n > 0 ? ga / n : leagueMean;

  return {
    teamId: stats.teamId,
    expectedGoalsFor: (n * rawGF + M * leagueMean) / (n + M),
    expectedGoalsAgainst: (n * rawGA + M * leagueMean) / (n + M),
    matchesUsed: n,
  };
}
