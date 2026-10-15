import type { NormalizedMatch } from '../providers/match-history.types';
import { isMatchEligible } from './match-eligibility.utils';
import { getTeamMatchResult } from './match-result.utils';

/**
 * Ratinguri de atac si aparare pe echipa, ajustate dupa adversar.
 * Functie pura (fara baza de date): primeste meciurile, intoarce ratingurile.
 *
 * Model (multiplicativ, in stilul Maher / Dixon-Coles, fara home/away):
 *   goluri asteptate ale lui i contra lui j = baza * atac(i) * aparare(j)
 *   - atac(i)    > 1 : marcheaza mai mult decat media; < 1 : mai putin
 *   - aparare(j) > 1 : primeste mai mult decat media (aparare SLABA); < 1 : aparare buna
 *
 * Estimare (iterativa, pana la convergenta), pentru fiecare echipa i:
 *   atac(i)    = (SUM w*golDat(i)    + k*mu) / (SUM w*mu*aparare(adv) + k*mu)
 *   aparare(i) = (SUM w*golPrimit(i) + k*mu) / (SUM w*mu*atac(adv)    + k*mu)
 * Astfel, goluri multe date unei aparari slabe cresc putin ratingul de atac,
 * iar aceleasi goluri date unei aparari bune il cresc mult mai mult.
 *
 * Ponderea w a unui meci (din perspectiva unei echipe):
 *   - recenta: 0.5 ^ (cate meciuri mai noi are ECHIPA aceea / halfLifeMatches)
 *   - competitie: 1 pentru competitia tinta, otherCompetitionWeight pentru restul
 *     (daca nu se da competitionId, toate au ponderea 1)
 * Plafon de golaveraj: un meci castigat cu 9-0 conteaza ca 5-0 (goalDifferenceCap = 5).
 * Shrinkage: k = priorMatches "meciuri imaginare" de nivel mediu trag ratingurile
 * echipelor cu putine meciuri spre 1 (media).
 *
 * Ratingurile sunt normalizate astfel incat media atacurilor si media apararilor = 1.
 * O echipa fara niciun meci eligibil NU primeste rating (nu inventam valori).
 */

export interface TeamRatingsOptions {
  /** Competitia pentru care se calculeaza (influenteaza ponderile si baza de goluri). */
  competitionId?: string;
  /** Dupa cate meciuri ale echipei, ponderea scade la jumatate. Default 10. */
  halfLifeMatches?: number;
  /** Ponderea meciurilor din alte competitii fata de cea tinta (0..1). Default 0.7. */
  otherCompetitionWeight?: number;
  /** Numar de meciuri "imaginare" medii (shrinkage). Default 3. */
  priorMatches?: number;
  /** Diferenta maxima de goluri luata in calcul pe un meci. Default 5. */
  goalDifferenceCap?: number;
  /** Numar maxim de iteratii. Default 200. */
  maxIterations?: number;
  /** Prag de convergenta (schimbare maxima a unui rating intre iteratii). Default 1e-10. */
  tolerance?: number;
}

export interface TeamRating {
  teamId: string;
  attack: number;
  defense: number;
  /** Numar de meciuri eligibile ale echipei. */
  matchesUsed: number;
  /** Suma ponderilor (cat de multe date "efective" are echipa). */
  weightSum: number;
}

export interface TeamRatingsResult {
  ratings: Map<string, TeamRating>;
  /** Media ponderata a golurilor pe echipa si pe meci, din toate meciurile eligibile. */
  baselineGoals: number | null;
  /** Media golurilor pe echipa si pe meci in competitia tinta (null daca nu exista meciuri). */
  competitionGoals: number | null;
  iterations: number;
  converged: boolean;
}

const DEFAULTS = {
  halfLifeMatches: 10,
  otherCompetitionWeight: 0.7,
  priorMatches: 3,
  goalDifferenceCap: 5,
  maxIterations: 200,
  tolerance: 1e-10,
};

interface Observation {
  team: string;
  opponent: string;
  goalsFor: number;
  goalsAgainst: number;
  weight: number;
}

/** Limiteaza diferenta de goluri, pastrand pierzatorul neschimbat. */
export function capGoalDifference(goalsFor: number, goalsAgainst: number, cap: number): { gf: number; ga: number } {
  if (goalsFor - goalsAgainst > cap) return { gf: goalsAgainst + cap, ga: goalsAgainst };
  if (goalsAgainst - goalsFor > cap) return { gf: goalsFor, ga: goalsFor + cap };
  return { gf: goalsFor, ga: goalsAgainst };
}

function resolveOptions(options: TeamRatingsOptions) {
  const o = { ...DEFAULTS, ...options };
  if (!(o.halfLifeMatches > 0)) throw new RangeError('halfLifeMatches trebuie sa fie > 0');
  if (!(o.otherCompetitionWeight >= 0 && o.otherCompetitionWeight <= 1)) {
    throw new RangeError('otherCompetitionWeight trebuie sa fie in [0, 1]');
  }
  if (!(o.priorMatches >= 0)) throw new RangeError('priorMatches trebuie sa fie >= 0');
  if (!(o.goalDifferenceCap >= 0)) throw new RangeError('goalDifferenceCap trebuie sa fie >= 0');
  if (!(o.maxIterations >= 1)) throw new RangeError('maxIterations trebuie sa fie >= 1');
  return o;
}

export function computeTeamRatings(
  matches: NormalizedMatch[],
  asOf: Date,
  options: TeamRatingsOptions = {}
): TeamRatingsResult {
  const opts = resolveOptions(options);

  // 1. Doar meciuri eligibile, in ordine cronologica (data, apoi id — determinist)
  const eligible = matches
    .filter((m) => isMatchEligible(m, asOf))
    .sort((a, b) => {
      const d = new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime();
      return d !== 0 ? d : a.matchId.localeCompare(b.matchId);
    });

  if (eligible.length === 0) {
    return { ratings: new Map(), baselineGoals: null, competitionGoals: null, iterations: 0, converged: true };
  }

  // 2. Rangul recentei per echipa (0 = cel mai recent meci al ECHIPEI)
  const perTeam = new Map<string, number[]>();
  eligible.forEach((m, idx) => {
    for (const id of [m.homeTeamId, m.awayTeamId]) {
      if (!perTeam.has(id)) perTeam.set(id, []);
      perTeam.get(id)!.push(idx);
    }
  });
  const recencyRank = (teamId: string, idx: number): number => {
    const list = perTeam.get(teamId)!;
    return list.length - 1 - list.indexOf(idx);
  };

  // 3. Observatii (cate una pe echipa si pe meci), cu goluri plafonate si ponderi
  const obs: Observation[] = [];
  let compGoalsSum = 0;
  let compMatches = 0;
  eligible.forEach((m, idx) => {
    const inTarget = opts.competitionId === undefined || m.competitionId === opts.competitionId;
    const compWeight = inTarget ? 1 : opts.otherCompetitionWeight;
    if (opts.competitionId !== undefined && m.competitionId === opts.competitionId) {
      compGoalsSum += m.homeScore! + m.awayScore!;
      compMatches++;
    }
    for (const teamId of [m.homeTeamId, m.awayTeamId]) {
      const res = getTeamMatchResult(m, teamId);
      if (!res) continue;
      const capped = capGoalDifference(res.goalsFor, res.goalsAgainst, opts.goalDifferenceCap);
      obs.push({
        team: teamId,
        opponent: res.opponentId,
        goalsFor: capped.gf,
        goalsAgainst: capped.ga,
        weight: Math.pow(0.5, recencyRank(teamId, idx) / opts.halfLifeMatches) * compWeight,
      });
    }
  });

  // 4. Baza de goluri (medie ponderata pe echipa si pe meci)
  let wGoals = 0;
  let wSum = 0;
  for (const o of obs) {
    wGoals += o.weight * o.goalsFor;
    wSum += o.weight;
  }
  const mu = wSum > 0 ? wGoals / wSum : 0;
  const competitionGoals = compMatches > 0 ? compGoalsSum / (2 * compMatches) : null;

  const teams = [...perTeam.keys()];
  const attack = new Map<string, number>(teams.map((t) => [t, 1]));
  const defense = new Map<string, number>(teams.map((t) => [t, 1]));
  const weightSum = new Map<string, number>(teams.map((t) => [t, 0]));
  for (const o of obs) weightSum.set(o.team, weightSum.get(o.team)! + o.weight);

  // 5. Iteratii (daca baza e 0 — toate scorurile 0-0 — ratingurile raman 1)
  let iterations = 0;
  let converged = true;
  if (mu > 0) {
    converged = false;
    const k = opts.priorMatches;
    const byTeam = new Map<string, Observation[]>(teams.map((t) => [t, []]));
    for (const o of obs) byTeam.get(o.team)!.push(o);

    for (iterations = 1; iterations <= opts.maxIterations; iterations++) {
      const nextA = new Map<string, number>();
      const nextD = new Map<string, number>();
      for (const t of teams) {
        let numA = k * mu, denA = k * mu, numD = k * mu, denD = k * mu;
        for (const o of byTeam.get(t)!) {
          numA += o.weight * o.goalsFor;
          denA += o.weight * mu * defense.get(o.opponent)!;
          numD += o.weight * o.goalsAgainst;
          denD += o.weight * mu * attack.get(o.opponent)!;
        }
        // Daca numitorul e 0 nu putem estima: pastram valoarea anterioara
        nextA.set(t, denA > 0 ? numA / denA : attack.get(t)!);
        nextD.set(t, denD > 0 ? numD / denD : defense.get(t)!);
      }
      // Normalizare: media atacurilor = media apararilor = 1
      const meanA = [...nextA.values()].reduce((s, v) => s + v, 0) / teams.length;
      const meanD = [...nextD.values()].reduce((s, v) => s + v, 0) / teams.length;
      let maxChange = 0;
      for (const t of teams) {
        const a = meanA > 0 ? nextA.get(t)! / meanA : nextA.get(t)!;
        const d = meanD > 0 ? nextD.get(t)! / meanD : nextD.get(t)!;
        maxChange = Math.max(maxChange, Math.abs(a - attack.get(t)!), Math.abs(d - defense.get(t)!));
        attack.set(t, a);
        defense.set(t, d);
      }
      if (maxChange < opts.tolerance) {
        converged = true;
        break;
      }
    }
    if (iterations > opts.maxIterations) iterations = opts.maxIterations;
  }

  const ratings = new Map<string, TeamRating>();
  for (const t of teams) {
    ratings.set(t, {
      teamId: t,
      attack: attack.get(t)!,
      defense: defense.get(t)!,
      matchesUsed: perTeam.get(t)!.length,
      weightSum: weightSum.get(t)!,
    });
  }

  return { ratings, baselineGoals: mu, competitionGoals, iterations, converged };
}

export interface ExpectedGoalsFromRatings {
  lambdaA: number | null;
  lambdaB: number | null;
  /** De unde vine baza de goluri: media competitiei sau (fallback) media globala. */
  baselineSource: 'competition' | 'global';
}

/**
 * Goluri asteptate pentru A contra B din ratinguri:
 *   lambdaA = baza * atac(A) * aparare(B),  lambdaB = baza * atac(B) * aparare(A)
 * Baza = media golurilor din competitia tinta; daca nu exista meciuri in ea,
 * media globala (marcat explicit in baselineSource). null daca o echipa nu are
 * rating sau baza nu e pozitiva.
 */
export function expectedGoalsFromRatings(
  result: TeamRatingsResult,
  teamA: string,
  teamB: string
): ExpectedGoalsFromRatings {
  const useCompetition = result.competitionGoals !== null;
  const base = useCompetition ? result.competitionGoals : result.baselineGoals;
  const baselineSource = useCompetition ? 'competition' : 'global';
  const a = result.ratings.get(teamA);
  const b = result.ratings.get(teamB);
  if (!a || !b || base === null || !(base > 0)) {
    return { lambdaA: null, lambdaB: null, baselineSource };
  }
  return {
    lambdaA: base * a.attack * b.defense,
    lambdaB: base * b.attack * a.defense,
    baselineSource,
  };
}
