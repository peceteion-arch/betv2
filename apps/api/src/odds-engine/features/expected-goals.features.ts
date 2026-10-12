import { matchHistoryProvider } from '../providers/match-history.provider';
import { NormalizedMatch } from '../providers/match-history.types';
import { ExpectedGoals, ExpectedGoalsResult } from './expected-goals.types';

const M = 5; // Constanta de temperare (Bayesian Shrinkage)

/**
 * Calculează golurile așteptate (xG) pentru gazde și oaspeți.
 * Formula: lambdaH = MeanH * HomeAttack * AwayDefense
 * Formula: lambdaA = MeanA * AwayAttack * HomeDefense
 */
export async function getExpectedGoals(
  homeTeamId: string,
  awayTeamId: string,
  asOf: Date
): Promise<ExpectedGoalsResult> {
  const homeMatches = await matchHistoryProvider.getTeamMatches(homeTeamId, asOf);
  const awayMatches = await matchHistoryProvider.getTeamMatches(awayTeamId, asOf);

  const eligibleHome = homeMatches.filter(isEligible);
  const eligibleAway = awayMatches.filter(isEligible);

  // 1. Calculăm mediile pe competiție (Baseline)
  // Deoarece un meci poate avea competitionId diferit, extragem un baseline simplificat
  // pentru fiecare echipă din istoricul propriu.
  const homeStats = calculateStats(eligibleHome, homeTeamId);
  const awayStats = calculateStats(eligibleAway, awayTeamId);

  // 2. Baseline-uri (dacă nu există date, returnăm null)
  if (homeStats.matches === 0 || awayStats.matches === 0) {
    return {
      home: { teamId: homeTeamId, expectedGoalsFor: null, expectedGoalsAgainst: null, matchesUsed: 0 },
      away: { teamId: awayTeamId, expectedGoalsFor: null, expectedGoalsAgainst: null, matchesUsed: 0 }
    };
  }

  // Mediile echipelor (temperat)
  const homeAttack = (homeStats.gf / homeStats.matches);
  const awayDefense = (awayStats.ga / awayStats.matches);
  const awayAttack = (awayStats.gf / awayStats.matches);
  const homeDefense = (homeStats.ga / homeStats.matches);

  // Calculăm lambda
  // Aceasta este o primă versiune: xG_H = AttackH * DefenseA
  return {
    home: {
      teamId: homeTeamId,
      expectedGoalsFor: homeAttack * awayDefense,
      expectedGoalsAgainst: homeDefense * awayAttack,
      matchesUsed: homeStats.matches
    },
    away: {
      teamId: awayTeamId,
      expectedGoalsFor: awayAttack * homeDefense,
      expectedGoalsAgainst: awayDefense * homeAttack,
      matchesUsed: awayStats.matches
    }
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
    const goalsFor = isHome ? match.homeScore! : match.awayScore!;
    const goalsAgainst = isHome ? match.awayScore! : match.homeScore!;
    
    if (goalsFor < 0 || goalsAgainst < 0) continue;

    gf += goalsFor;
    ga += goalsAgainst;
    count++;
  }
  return { gf, ga, matches: count };
}
