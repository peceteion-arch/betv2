import { matchHistoryProvider } from '../providers/match-history.provider';
import { NormalizedMatch } from '../providers/match-history.types';
import { ExpectedGoals, ExpectedGoalsResult } from './expected-goals.types';

/**
 * Calculează golurile așteptate (xG) pentru gazde și oaspeți.
 * Formula normalizată:
 * lambdaHome = (homeTeamHomeGoalsForAvg * awayTeamAwayGoalsAgainstAvg) / competitionHomeGoalsAvg
 * lambdaAway = (awayTeamAwayGoalsForAvg * homeTeamHomeGoalsAgainstAvg) / competitionAwayGoalsAvg
 *
 * Toate mediile sunt calculate doar din meciurile FINISHED ale competiției date.
 */
export async function getExpectedGoals(
  homeTeamId: string,
  awayTeamId: string,
  asOf: Date,
  competitionId: string
): Promise<ExpectedGoalsResult> {
  // Obține toate mecanțele echipelor (fără filtrer de competiție – vom filtra ulterior)
  const homeMatches = await matchHistoryProvider.getTeamMatches(homeTeamId, asOf);
  const awayMatches = await matchHistoryProvider.getTeamMatches(awayTeamId, asOf);

  // Filtrăm mecajele eligibile: FINISHED, scoruri numerice, nenegative, dată < asOf, și competencia corespunzătoare
  const isEligible = (m: NormalizedMatch): boolean =>
    m.status === 'FINISHED' &&
    m.homeScore !== null &&
    m.awayScore !== null &&
    m.homeScore >= 0 &&
    m.awayScore >= 0 &&
    m.matchDate < asOf &&
    m.competitionId === competitionId;

  const eligibleHome = homeMatches.filter(isEligible);
  const eligibleAway = awayMatches.filter(isEligible);
  // Mecajele competitiei (folosim oricare dintre liste, filtrările sunt identice)
  const eligibleMatches = eligibleHome.length > 0 ? eligibleHome : eligibleAway; // orice listă funcționa pentru mediile de competiție
  // Pentru siguranță, recomputăm din unite:
  const allMatches = [...homeMatches, ...awayMatches].filter(isEligible);

  // Dacă nu avem suficiente date pentru competiție, returnăm indisponibilitate
  if (eligibleMatches.length === 0) {
    return {
      home: { teamId: homeTeamId, expectedGoalsFor: null, expectedGoalsAgainst: null, matchesUsed: 0 },
      away: { teamId: awayTeamId, expectedGoalsFor: null, expectedGoalsAgainst: null, matchesUsed: 0 }
    };
  }

  // --- Calcule pentru competiție (baseline) ---
  let competitionHomeGoalsSum = 0;
  let competitionAwayGoalsSum = 0;
  for (const m of eligibleMatches) {
    competitionHomeGoalsSum += m.homeScore!;
    competitionAwayGoalsSum += m.awayScore!;
  }
  const competitionHomeGoalsAvg = competitionHomeGoalsSum / eligibleMatches.length;
  const competitionAwayGoalsAvg = competitionAwayGoalsSum / eligibleMatches.length;

  // --- Statistici gazdă (mecaje acasă) ---
  let homeTeamHomeGF = 0;   // goluri marcate de gazdă când e gazdă
  let homeTeamHomeGA = 0;   // goluri primite de gazdă când e gazdă
  let homeTeamHomeCount = 0;
  for (const m of eligibleHome) {
    if (m.homeTeamId === homeTeamId) {
      homeTeamHomeGF += m.homeScore!;
      homeTeamHomeGA += m.awayScore!;
      homeTeamHomeCount++;
    }
  }
  const homeTeamHomeGoalsForAvg = homeTeamHomeCount > 0 ? homeTeamHomeGF / homeTeamHomeCount : 0;
  const homeTeamHomeGoalsAgainstAvg = homeTeamHomeCount > 0 ? homeTeamHomeGA / homeTeamHomeCount : 0;

  // --- Statistici oaspete (mecaje în deplasare) ---
  let awayTeamAwayGF = 0;   // goluri marcate de oaspete când e oaspete
  let awayTeamAwayGA = 0;   // goluri primite de oaspete când e oaspete (goluri gazdei)
  let awayTeamAwayCount = 0;
  for (const m of eligibleAway) {
    if (m.awayTeamId === awayTeamId) {
      awayTeamAwayGF += m.awayScore!;
      awayTeamAwayGA += m.homeScore!;
      awayTeamAwayCount++;
    }
  }
  const awayTeamAwayGoalsForAvg = awayTeamAwayCount > 0 ? awayTeamAwayGF / awayTeamAwayCount : 0;
  const awayTeamAwayGoalsAgainstAvg = awayTeamAwayCount > 0 ? awayTeamAwayGA / awayTeamAwayCount : 0;

  // Verificăm divizori zero pentru mediile de competiție
  if (competitionHomeGoalsAvg === 0 || competitionAwayGoalsAvg === 0) {
    return {
      home: { teamId: homeTeamId, expectedGoalsFor: null, expectedGoalsAgainst: null, matchesUsed: homeTeamHomeCount },
      away: { teamId: awayTeamId, expectedGoalsFor: null, expectedGoalsAgainst: null, matchesUsed: awayTeamAwayCount }
    };
  }

  // Lambdas pe baza formulei normalizate
  const lambdaHome = (homeTeamHomeGoalsForAvg * awayTeamAwayGoalsAgainstAvg) / competitionHomeGoalsAvg;
  const lambdaAway = (awayTeamAwayGoalsForAvg * homeTeamHomeGoalsAgainstAvg) / competitionAwayGoalsAvg;

  return {
    home: {
      teamId: homeTeamId,
      expectedGoalsFor: lambdaHome,
      expectedGoalsAgainst: null, // nu este potrzeb în acest context
      matchesUsed: homeTeamHomeCount
    },
    away: {
      teamId: awayTeamId,
      expectedGoalsFor: lambdaAway,
      expectedGoalsAgainst: null,
      matchesUsed: awayTeamAwayCount
    }
  };
}