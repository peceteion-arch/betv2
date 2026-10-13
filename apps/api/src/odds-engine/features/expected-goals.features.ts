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
  // 1. Baseline competiție - meciuri strict din competiția curentă
  const competitionMatches = await matchHistoryProvider.getCompetitionMatches(competitionId, asOf);
  const eligibleCompMatches = competitionMatches.filter(m =>
    isMatchEligible(m, asOf) && m.competitionId === competitionId
  );

  // 2. Istoric global echipe - meciuri din toate competițiile
  const homeTeamMatches = await matchHistoryProvider.getTeamMatches(homeTeamId, asOf);
  const awayTeamMatches = await matchHistoryProvider.getTeamMatches(awayTeamId, asOf);

  // 3. Filtrăm meciurile relevante pentru fiecare echipă (Acasă pentru gazdă, Deplasare pentru oaspete)
  const homeEligible = homeTeamMatches.filter(m =>
    isMatchEligible(m, asOf) && m.homeTeamId === homeTeamId
  );
  const awayEligible = awayTeamMatches.filter(m =>
    isMatchEligible(m, asOf) && m.awayTeamId === awayTeamId
  );

  // 4. Calcul baseline competiție
  if (eligibleCompMatches.length === 0) {
    return {
      home: { teamId: homeTeamId, lambdaHome: null, matchesUsed: homeEligible.length },
      away: { teamId: awayTeamId, lambdaAway: null, matchesUsed: awayEligible.length }
    };
  }

  let compHomeGFSum = 0;
  let compAwayGFSum = 0;
  for (const m of eligibleCompMatches) {
    compHomeGFSum += m.homeScore!;
    compAwayGFSum += m.awayScore!;
  }
  const compHomeGoalsAvg = compHomeGFSum / eligibleCompMatches.length;
  const compAwayGoalsAvg = compAwayGFSum / eligibleCompMatches.length;

  // Dacă mediile baseline sunt zero, nu putem normaliza
  if (compHomeGoalsAvg === 0 || compAwayGoalsAvg === 0) {
    return {
      home: { teamId: homeTeamId, lambdaHome: null, matchesUsed: homeEligible.length },
      away: { teamId: awayTeamId, lambdaAway: null, matchesUsed: awayEligible.length }
    };
  }

  // 5. Statistici echipe (Istoric Global)
  // Media gazdei acasă
  let homeTeamHomeGF = 0;
  let homeTeamHomeGA = 0;
  for (const m of homeEligible) {
    homeTeamHomeGF += m.homeScore!;
    homeTeamHomeGA += m.awayScore!;
  }
  const hthGFAvg = homeEligible.length > 0 ? homeTeamHomeGF / homeEligible.length : null;
  const hthGAAvg = homeEligible.length > 0 ? homeTeamHomeGA / homeEligible.length : null;

  // Media oaspetelui în deplasare
  let awayTeamAwayGF = 0;
  let awayTeamAwayGA = 0;
  for (const m of awayEligible) {
    awayTeamAwayGF += m.awayScore!;
    awayTeamAwayGA += m.homeScore!;
  }
  const ataGFAvg = awayEligible.length > 0 ? awayTeamAwayGF / awayEligible.length : null;
  const ataGAAvg = awayEligible.length > 0 ? awayTeamAwayGA / awayEligible.length : null;

  // 6. Calcul Final λ conform formulei
  const lambdaHome = (hthGFAvg !== null && ataGAAvg !== null)
    ? (hthGFAvg * ataGAAvg) / compHomeGoalsAvg
    : null;

  const lambdaAway = (ataGFAvg !== null && hthGAAvg !== null)
    ? (ataGFAvg * hthGAAvg) / compAwayGoalsAvg
    : null;

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
