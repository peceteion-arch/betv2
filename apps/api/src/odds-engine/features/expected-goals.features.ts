import { matchHistoryProvider } from '../providers/match-history.provider';
import { NormalizedMatch } from '../providers/match-history.types';
import { ExpectedGoalsResult } from './expected-goals.types';

/**
 * Calculează golurile așteptate (xG) normalizate pentru gazde și oaspeți.
 * Formula:
 * lambdaHome = (homeTeamHomeGoalsForAvg * awayTeamAwayGoalsAgainstAvg) / competitionHomeGoalsAvg
 * lambdaAway = (awayTeamAwayGoalsForAvg * homeTeamHomeGoalsAgainstAvg) / competitionAwayGoalsAvg
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
  const calculateLambda = (forAvg: number | null, againstAvg: number | null, compAvg: number | null) => {
    if (forAvg === null || againstAvg === null || compAvg === null || compAvg <= 0 || !Number.isFinite(compAvg)) {
      return null;
    }
    const lambda = (forAvg * againstAvg) / compAvg;
    return Number.isFinite(lambda) && lambda >= 0 ? lambda : null;
  };

  const lambdaHome = calculateLambda(hthGFAvg, ataGAAvg, compHomeGoalsAvg);
  const lambdaAway = calculateLambda(ataGFAvg, hthGAAvg, compAwayGoalsAvg);

  return {
    home: { teamId: homeTeamId, lambdaHome, matchesUsed: homeEligible.length },
    away: { teamId: awayTeamId, lambdaAway, matchesUsed: awayEligible.length }
  };
}

/**
 * Verifică eligibilitatea unui meci.
 * Un meci este eligibil dacă: FINISHED, scoruri finite și non-negative, și data < asOf.
 */
function isMatchEligible(m: NormalizedMatch, asOf: Date): boolean {
  return (
    m.status === 'FINISHED' &&
    m.homeScore !== null &&
    m.awayScore !== null &&
    Number.isFinite(m.homeScore) &&
    Number.isFinite(m.awayScore) &&
    m.homeScore >= 0 &&
    m.awayScore >= 0 &&
    m.matchDate < asOf
  );
}
