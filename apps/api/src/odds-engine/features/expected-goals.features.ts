import { matchHistoryProvider } from '../providers/match-history.provider';
import { NormalizedMatch } from '../providers/match-history.types';

export interface ExpectedGoalsResult {
  home: {
    teamId: string;
    lambdaHome: number | null;
    matchesUsed: number;
  };
  away: {
    teamId: string;
    lambdaAway: number | null;
    matchesUsed: number;
  };
}

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
  // 1. Obținem toate meciurile competiției pentru baseline
  const competitionMatches = await matchHistoryProvider.getCompetitionMatches(competitionId, asOf);
  const eligibleMatches = competitionMatches.filter(isEligible);

  // 2. Obținem meciurile echipelor
  const homeTeamMatches = await matchHistoryProvider.getTeamMatches(homeTeamId, asOf);
  const awayTeamMatches = await matchHistoryProvider.getTeamMatches(awayTeamId, asOf);

  // 3. Calculăm baseline-ul competiției
  if (eligibleMatches.length === 0) {
    return createUnavailableResult(homeTeamId, awayTeamId);
  }

  let compHomeGFSum = 0;
  let compAwayGFSum = 0;
  for (const m of eligibleMatches) {
    compHomeGFSum += m.homeScore!;
    compAwayGFSum += m.awayScore!;
  }
  const compHomeGoalsAvg = compHomeGFSum / eligibleMatches.length;
  const compAwayGoalsAvg = compAwayGFSum / eligibleMatches.length;

  if (compHomeGoalsAvg === 0 || compAwayGoalsAvg === 0) {
    return createUnavailableResult(homeTeamId, awayTeamId);
  }

  // 4. Statistici echipe (Home -> acasă, Away -> deplasare)
  const homeEligible = homeTeamMatches.filter(m => isEligible(m) && m.homeTeamId === homeTeamId);
  const awayEligible = awayTeamMatches.filter(m => isEligible(m) && m.awayTeamId === awayTeamId);

  // HomeTeamStats (acasă)
  let homeTeamHomeGF = 0;
  let homeTeamHomeGA = 0;
  for (const m of homeEligible) {
    homeTeamHomeGF += m.homeScore!;
    homeTeamHomeGA += m.awayScore!;
  }
  const hthGFAvg = homeEligible.length > 0 ? homeTeamHomeGF / homeEligible.length : null;
  const hthGAAvg = homeEligible.length > 0 ? homeTeamHomeGA / homeEligible.length : null;

  // AwayTeamStats (deplasare)
  let awayTeamAwayGF = 0;
  let awayTeamAwayGA = 0;
  for (const m of awayEligible) {
    awayTeamAwayGF += m.awayScore!;
    awayTeamAwayGA += m.homeScore!;
  }
  const ataGFAvg = awayEligible.length > 0 ? awayTeamAwayGF / awayEligible.length : null;
  const ataGAAvg = awayEligible.length > 0 ? awayTeamAwayGA / awayEligible.length : null;

  // 5. Calcul Final
  // Verificăm dacă avem datele necesare pentru formula:
  // lambdaHome = (hthGFAvg * ataGAAvg) / compHomeGoalsAvg
  // lambdaAway = (ataGFAvg * hthGAAvg) / compAwayGoalsAvg

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

function isEligible(m: NormalizedMatch): boolean {
  return (
    m.status === 'FINISHED' &&
    m.homeScore !== null &&
    m.awayScore !== null &&
    m.homeScore >= 0 &&
    m.awayScore >= 0
  );
}

function createUnavailableResult(homeId: string, awayId: string): ExpectedGoalsResult {
  return {
    home: { teamId: homeId, lambdaHome: null, matchesUsed: 0 },
    away: { teamId: awayId, lambdaAway: null, matchesUsed: 0 }
  };
}
