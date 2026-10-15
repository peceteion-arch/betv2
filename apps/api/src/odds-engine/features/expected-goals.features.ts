import { matchHistoryProvider } from '../providers/match-history.provider';
import { NormalizedMatch } from '../providers/match-history.types';
import { ExpectedGoalsResult } from './expected-goals.types';
import { isMatchEligible } from './match-eligibility.utils';
import { getTeamMatchResult } from './match-result.utils';

/**
 * Goluri asteptate (xG) FARA separare acasa/deplasare.
 *
 * Toate meciurile se joaca pe acelasi teren, deci "gazda" / "oaspete" sunt
 * doar etichete: primul argument este echipa A, al doilea echipa B. Se
 * folosesc TOATE meciurile eligibile ale fiecarei echipe (din toate
 * competitiile), indiferent cine figura ca gazda.
 *
 * Formula:
 *   lambdaA = compAvg * (GF_A / globalAvg) * (GA_B / globalAvg)
 *   lambdaB = compAvg * (GF_B / globalAvg) * (GA_A / globalAvg)
 * unde:
 *   - GF_X / GA_X = media golurilor date / primite de echipa X pe meci
 *   - globalAvg   = media golurilor pe echipa si pe meci, toate competitiile
 *   - compAvg     = media golurilor pe echipa si pe meci, competitia curenta
 *
 * NU face inca ajustare dupa forta adversarilor din meciurile trecute si nu
 * pondereaza dupa recenta — acestea sunt pasi urmatori (ratinguri atac/aparare).
 */

/** Media golurilor pe echipa si pe meci: (goluri gazda + goluri oaspeti) / (2 * meciuri). */
function avgGoalsPerTeam(matches: NormalizedMatch[]): number | null {
  if (matches.length === 0) return null;
  let total = 0;
  for (const m of matches) {
    total += m.homeScore! + m.awayScore!;
  }
  return total / (2 * matches.length);
}

interface TeamAverages {
  gfAvg: number | null;
  gaAvg: number | null;
  matchesUsed: number;
}

/** Media golurilor date / primite de o echipa, din toate meciurile eligibile. */
function teamAverages(matches: NormalizedMatch[], teamId: string, asOf: Date): TeamAverages {
  let gf = 0;
  let ga = 0;
  let n = 0;
  for (const m of matches) {
    if (!isMatchEligible(m, asOf)) continue;
    const res = getTeamMatchResult(m, teamId);
    if (!res) continue;
    gf += res.goalsFor;
    ga += res.goalsAgainst;
    n++;
  }
  return {
    gfAvg: n > 0 ? gf / n : null,
    gaAvg: n > 0 ? ga / n : null,
    matchesUsed: n,
  };
}

function calculateLambda(
  attackAvg: number | null,
  concededAvg: number | null,
  compAvg: number | null,
  globalAvg: number | null
): number | null {
  if (
    attackAvg === null || concededAvg === null || compAvg === null || globalAvg === null ||
    !Number.isFinite(compAvg) || !Number.isFinite(globalAvg) ||
    compAvg <= 0 || globalAvg <= 0
  ) {
    return null;
  }
  const lambda = compAvg * (attackAvg / globalAvg) * (concededAvg / globalAvg);
  return Number.isFinite(lambda) && lambda >= 0 ? lambda : null;
}

export async function getExpectedGoals(
  homeTeamId: string,
  awayTeamId: string,
  asOf: Date,
  competitionId: string
): Promise<ExpectedGoalsResult> {
  // 1. Baseline competitie (strict pe competitionId, doar meciuri eligibile)
  const competitionMatches = await matchHistoryProvider.getCompetitionMatches(competitionId, asOf);
  const eligibleCompMatches = competitionMatches.filter(
    (m) => isMatchEligible(m, asOf) && m.competitionId === competitionId
  );
  const compAvg = avgGoalsPerTeam(eligibleCompMatches);

  // 2. Baseline global (toate competitiile, doar meciuri eligibile)
  const globalMatches = (await matchHistoryProvider.getGlobalMatches(asOf)).filter((m) =>
    isMatchEligible(m, asOf)
  );
  const globalAvg = avgGoalsPerTeam(globalMatches);

  // 3. Istoricul fiecarei echipe — toate meciurile, fara filtru acasa/deplasare
  const teamAMatches = await matchHistoryProvider.getTeamMatches(homeTeamId, asOf);
  const teamBMatches = await matchHistoryProvider.getTeamMatches(awayTeamId, asOf);
  const a = teamAverages(teamAMatches, homeTeamId, asOf);
  const b = teamAverages(teamBMatches, awayTeamId, asOf);

  // 4. Lambda pentru fiecare echipa
  const lambdaHome = calculateLambda(a.gfAvg, b.gaAvg, compAvg, globalAvg);
  const lambdaAway = calculateLambda(b.gfAvg, a.gaAvg, compAvg, globalAvg);

  return {
    home: { teamId: homeTeamId, lambdaHome, matchesUsed: a.matchesUsed },
    away: { teamId: awayTeamId, lambdaAway, matchesUsed: b.matchesUsed },
  };
}
