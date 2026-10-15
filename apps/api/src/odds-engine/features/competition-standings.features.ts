import type { NormalizedMatch } from '../providers/match-history.types';
import { isMatchEligible } from './match-eligibility.utils';
import { getTeamMatchResult } from './match-result.utils';

/**
 * Clasament calculat din meciuri (functie pura, fara acces la baza de date).
 *
 * Criterii de departajare (in ordine): puncte, golaveraj, goluri marcate.
 * Daca raman egale si dupa asta, ordinea este deterministica (dupa teamId),
 * iar echipele raman cu acelasi `rank` doar daca au TOATE cele trei valori
 * identice (loc impartit) — nu inventam o ordine "corecta" intre ele.
 *
 * Apelantul alege ce meciuri dau: de exemplu doar cele dintr-o competitie
 * (provider.getCompetitionMatches) sau toate. Aici se filtreaza doar dupa
 * isMatchEligible (FINISHED, scoruri valide, matchDate < asOf).
 */

export interface StandingsRow {
  rank: number;
  teamId: string;
  teamName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export function computeStandings(matches: NormalizedMatch[], asOf: Date): StandingsRow[] {
  const table = new Map<string, Omit<StandingsRow, 'rank'>>();

  const rowFor = (teamId: string, teamName: string) => {
    let row = table.get(teamId);
    if (!row) {
      row = {
        teamId, teamName,
        played: 0, wins: 0, draws: 0, losses: 0,
        goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
      };
      table.set(teamId, row);
    }
    return row;
  };

  for (const match of matches) {
    if (!isMatchEligible(match, asOf)) continue;

    const sides = [
      { id: match.homeTeamId, name: match.homeTeamName },
      { id: match.awayTeamId, name: match.awayTeamName },
    ];
    for (const side of sides) {
      const res = getTeamMatchResult(match, side.id);
      if (!res) continue;
      const row = rowFor(side.id, side.name);
      row.played += 1;
      row.goalsFor += res.goalsFor;
      row.goalsAgainst += res.goalsAgainst;
      row.goalDifference += res.goalDifference;
      row.points += res.points;
      if (res.outcome === 'WIN') row.wins += 1;
      else if (res.outcome === 'DRAW') row.draws += 1;
      else row.losses += 1;
    }
  }

  const rows = [...table.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.teamId.localeCompare(b.teamId)
  );

  const result: StandingsRow[] = [];
  rows.forEach((row, i) => {
    const prev = result[i - 1];
    const tied =
      prev &&
      prev.points === row.points &&
      prev.goalDifference === row.goalDifference &&
      prev.goalsFor === row.goalsFor;
    result.push({ ...row, rank: tied ? prev.rank : i + 1 });
  });
  return result;
}
