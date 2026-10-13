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
  // 1. Obținem toate meciurile competiției pentru baseline
  const competitionMatches = await matchHistoryProvider.getCompetitionMatches(competitionId, asOf);
  const eligibleCompMatches = competitionMatches.filter(m => isEligible(m, competitionId));

  // 2. Obținem meciurile echipelor (filtrate strict pe competitionId și teren)
  const homeTeamMatches = await matchHistoryProvider.getTeamMatches(homeTeamId, asOf);
  const awayTeamMatches = await matchHistoryProvider.getTeamMatches(awayTeamId, asOf);

  // 3. Statistici echipe (Home -> acasă, Away -> deplasare), filtrate pe competitionId
  const homeEligible = homeTeamMatches.filter(m =>
    isEligible(m, competitionId) && m.homeTeamId === homeTeamId
  );
  const awayEligible = awayTeamMatches.filter(m =>
    isEligible(m, competitionId) && m.awayTeamId === awayTeamId
  );

  // 4. Calculăm baseline-ul competiției
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

  // Dacă mediile de competiție sunt zero, nu putem normaliza
  if (compHomeGoalsAvg === 0 || compAwayGoalsAvg === 0) {
    return {
      home: { teamId: homeTeamId, lambdaHome: null, matchesUsed: homeEligible.length },
      away: { teamId: awayTeamId, lambdaAway: null, matchesUsed: awayEligible.length }
    };
  }

  // 5. Calculăm mediile echipelor (HomeTeam acasă, AwayTeam deplasare)
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

  // 6. Calcul Final λ
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

function isEligible(m: NormalizedMatch, competitionId: string): boolean {
  return (
    m.status === 'FINISHED' &&
    m.homeScore !== null &&
    m.awayScore !== null &&
    m.homeScore >= 0 &&
    m.awayScore >= 0 &&
    m.competitionId === competitionId
  );
}
