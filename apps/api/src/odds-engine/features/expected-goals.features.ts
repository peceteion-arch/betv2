import { matchHistoryProvider } from '../providers/match-history.provider';
import { NormalizedMatch } from '../providers/match-history.types';
import { ExpectedGoalsResult } from './expected-goals.types';
import { isMatchEligible } from './match-eligibility.utils';

/**
 * Calculează golurile așteptate (xG) normalizate pentru gazde și oaspeți.
 * Formula convenită (PASUL 1.7):
 * lambdaHome = competitionHomeGoalsAvg * (homeTeamHomeGFAvg / globalHomeGoalsAvg) * (awayTeamAwayGAAvg / globalHomeGoalsAvg)
 * lambdaAway = competitionAwayGoalsAvg * (awayTeamAwayGFAvg / globalAwayGoalsAvg) * (homeTeamHomeGAAvg / globalAwayGoalsAvg)
 */
export async function getExpectedGoals(
  homeTeamId: string,
  awayTeamId: string,
  asOf: Date,
  competitionId: string
): Promise<ExpectedGoalsResult> {
  // 1. Obținem meciurile competiției pentru baseline (strict pe competitionId)
  const competitionMatches = await matchHistoryProvider.getCompetitionMatches(competitionId, asOf);
  const eligibleCompMatches = competitionMatches.filter(m =>
    isMatchEligible(m, asOf) && m.competitionId === competitionId
  );

  // 2. Obținem istoricul GLOBAL al echipelor (din toate competițiile)
  const homeTeamMatches = await matchHistoryProvider.getTeamMatches(homeTeamId, asOf);
  const awayTeamMatches = await matchHistoryProvider.getTeamMatches(awayTeamId, asOf);

  // 3. Filtrăm meciurile relevante pentru fiecare echipă (Acasă pentru gazdă, Deplasare pentru oaspete)
  const homeEligible = homeTeamMatches.filter(m =>
    isMatchEligible(m, asOf) && m.homeTeamId === homeTeamId
  );
  const awayEligible = awayTeamMatches.filter(m =>
    isMatchEligible(m, asOf) && m.awayTeamId === awayTeamId
  );

  const globalMatches = await matchHistoryProvider.getGlobalMatches(asOf);

  // 4. Calculăm baseline-ul competiției (independente pentru fiecare lambda)
  let compHomeGoalsAvg: number | null = null;
  let compAwayGoalsAvg: number | null = null;

  if (eligibleCompMatches.length > 0) {
    let compHomeGFSum = 0;
    let compAwayGFSum = 0;
    for (const m of eligibleCompMatches) {
      compHomeGFSum += m.homeScore!;
      compAwayGFSum += m.awayScore!;
    }
    compHomeGoalsAvg = compHomeGFSum / eligibleCompMatches.length;
    compAwayGoalsAvg = compAwayGFSum / eligibleCompMatches.length;
  }

  // 4b. Mediile globale din toate meciurile eligibile (toate competițiile, < asOf)
  let globalHomeGoalsAvg: number | null = null;
  let globalAwayGoalsAvg: number | null = null;
  if (globalMatches.length > 0) {
    let globalHomeSum = 0;
    let globalAwaySum = 0;
    for (const m of globalMatches) {
      globalHomeSum += m.homeScore!;
      globalAwaySum += m.awayScore!;
    }
    globalHomeGoalsAvg = globalHomeSum / globalMatches.length;
    globalAwayGoalsAvg = globalAwaySum / globalMatches.length;
  }

  // 5. Statistici echipe (Istoric Global)
  let homeTeamHomeGF = 0;
  let homeTeamHomeGA = 0;
  for (const m of homeEligible) {
    homeTeamHomeGF += m.homeScore!;
    homeTeamHomeGA += m.awayScore!;
  }
  const hthGFAvg = homeEligible.length > 0 ? homeTeamHomeGF / homeEligible.length : null;
  const hthGAAvg = homeEligible.length > 0 ? homeTeamHomeGA / homeEligible.length : null;

  let awayTeamAwayGF = 0;
  let awayTeamAwayGA = 0;
  for (const m of awayEligible) {
    awayTeamAwayGF += m.awayScore!;
    awayTeamAwayGA += m.homeScore!;
  }
  const ataGFAvg = awayEligible.length > 0 ? awayTeamAwayGF / awayEligible.length : null;
  const ataGAAvg = awayEligible.length > 0 ? awayTeamAwayGA / awayEligible.length : null;

  // 6. Calcul Final λ conform formulei (independent)
  const calculateLambda = (forAvg: number | null, againstAvg: number | null, compAvg: number | null, globalAvg: number | null) => {
    if (forAvg === null || againstAvg === null || compAvg === null || globalAvg === null || compAvg <= 0 || globalAvg <= 0 || !Number.isFinite(compAvg) || !Number.isFinite(globalAvg)) {
      return null;
    }
    const lambda = compAvg * (forAvg / globalAvg) * (againstAvg / globalAvg);
    return Number.isFinite(lambda) && lambda >= 0 ? lambda : null;
  };

  const lambdaHome = calculateLambda(hthGFAvg, ataGAAvg, compHomeGoalsAvg, globalHomeGoalsAvg);
  const lambdaAway = calculateLambda(ataGFAvg, hthGAAvg, compAwayGoalsAvg, globalAwayGoalsAvg);

  return {
    home: { teamId: homeTeamId, lambdaHome, matchesUsed: homeEligible.length },
    away: { teamId: awayTeamId, lambdaAway, matchesUsed: awayEligible.length }
  };
}

/**
 * Verifică eligibilitatea unui meci.
 * Un meci este eligibil dacă: FINISHED, scoruri finite și non-negative, și data < asOf.
 */
