import type { NormalizedMatch } from '../providers/match-history.types';

/**
 * Helper comun pentru rezultatul unui meci, din perspectiva unei echipe.
 * Inlocuieste logica duplicata (puncte / goluri date / goluri primite) din
 * team-basic-stats, team-form si team-home-away.
 *
 * NU verifica eligibilitatea (status, data, scoruri valide) — asta ramane
 * in isMatchEligible; apelantul filtreaza inainte. Aici, daca scorurile
 * lipsesc, intoarcem null (nu transformam lipsa in 0).
 */

export const POINTS_WIN = 3;
export const POINTS_DRAW = 1;
export const POINTS_LOSS = 0;

export type MatchOutcome = 'WIN' | 'DRAW' | 'LOSS';

export interface TeamMatchResult {
  teamId: string;
  opponentId: string;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  outcome: MatchOutcome;
  points: number;
}

/**
 * Rezultatul meciului din perspectiva lui `teamId`.
 * Returneaza null daca echipa nu joaca in meci, daca echipele sunt identice
 * sau daca lipseste vreun scor.
 */
export function getTeamMatchResult(
  match: Pick<NormalizedMatch, 'homeTeamId' | 'awayTeamId' | 'homeScore' | 'awayScore'>,
  teamId: string
): TeamMatchResult | null {
  if (match.homeTeamId === match.awayTeamId) return null;
  if (match.homeScore === null || match.awayScore === null) return null;

  const isHome = match.homeTeamId === teamId;
  const isAway = match.awayTeamId === teamId;
  if (!isHome && !isAway) return null;

  const goalsFor = isHome ? match.homeScore : match.awayScore;
  const goalsAgainst = isHome ? match.awayScore : match.homeScore;
  const opponentId = isHome ? match.awayTeamId : match.homeTeamId;

  let outcome: MatchOutcome;
  let points: number;
  if (goalsFor > goalsAgainst) {
    outcome = 'WIN';
    points = POINTS_WIN;
  } else if (goalsFor === goalsAgainst) {
    outcome = 'DRAW';
    points = POINTS_DRAW;
  } else {
    outcome = 'LOSS';
    points = POINTS_LOSS;
  }

  return {
    teamId,
    opponentId,
    goalsFor,
    goalsAgainst,
    goalDifference: goalsFor - goalsAgainst,
    outcome,
    points,
  };
}
