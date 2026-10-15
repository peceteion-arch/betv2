import type { H2HStats } from './h2h-stats.types';

/**
 * Ajustaj mic al golurilor asteptate (lambda) pe baza meciurilor directe (H2H).
 * Functie pura: primeste lambda-urile din model + statisticile H2H deja calculate
 * de getH2HStats (h2h-stats.features.ts) si intoarce lambda-uri ajustate.
 *
 * Reguli (toate configurabile):
 *   - sub `minMatches` meciuri directe (default 3): NICIun ajustaj;
 *   - greutatea H2H creste cu numarul de meciuri: w = n / (n + priorMatches)
 *     (default priorMatches = 10 -> n=3: 0.23, n=10: 0.50);
 *   - lambda' = lambda + w * (media_goluri_H2H - lambda);
 *   - rezultatul este limitat la lambda * (1 +/- maxAdjustment) (default +/-10%).
 *
 * De ce limitat: meciurile directe sunt deja incluse in ratingurile de atac /
 * aparare, deci o ponderare mare le-ar numara de doua ori; iar esantioanele
 * foarte mici nu sunt de incredere. H2H ramane un ajustaj, nu o componenta principala.
 *
 * Orientare: lambdaA corespunde echipei h2h.teamAId, lambdaB echipei h2h.teamBId.
 */

export interface H2HAdjustmentOptions {
  /** Numar minim de meciuri directe pentru a aplica ajustajul. Default 3. */
  minMatches?: number;
  /** Cat de repede creste greutatea H2H cu numarul de meciuri (w = n/(n+prior)). Default 10. */
  priorMatches?: number;
  /** Ajustaj maxim relativ fata de lambda (0.10 = +/-10%). Default 0.10. */
  maxAdjustment?: number;
}

export interface H2HAdjustmentResult {
  lambdaA: number | null;
  lambdaB: number | null;
  /** true daca ajustajul s-a aplicat (suficiente meciuri directe si date valide). */
  applied: boolean;
  /** Numarul de meciuri directe luate in calcul. */
  matches: number;
  /** Greutatea H2H folosita (0 daca nu s-a aplicat). */
  weight: number;
  /** Factorii finali lambda'/lambda (null daca lambda lipseste sau e 0). */
  factorA: number | null;
  factorB: number | null;
}

const DEFAULTS = { minMatches: 3, priorMatches: 10, maxAdjustment: 0.1 };

function adjustOne(lambda: number | null, h2hAvg: number | null, weight: number, cap: number): number | null {
  if (lambda === null || h2hAvg === null || !Number.isFinite(h2hAvg)) return lambda;
  const blended = lambda + weight * (h2hAvg - lambda);
  const lower = lambda * (1 - cap);
  const upper = lambda * (1 + cap);
  return Math.min(upper, Math.max(lower, blended));
}

export function applyH2HAdjustment(
  lambdaA: number | null,
  lambdaB: number | null,
  h2h: Pick<H2HStats, 'matches' | 'teamAGoalsPerMatch' | 'teamBGoalsPerMatch'>,
  options: H2HAdjustmentOptions = {}
): H2HAdjustmentResult {
  const o = { ...DEFAULTS, ...options };
  if (!(o.minMatches >= 1)) throw new RangeError('minMatches trebuie sa fie >= 1');
  if (!(o.priorMatches >= 0)) throw new RangeError('priorMatches trebuie sa fie >= 0');
  if (!(o.maxAdjustment >= 0 && o.maxAdjustment <= 1)) throw new RangeError('maxAdjustment trebuie sa fie in [0, 1]');

  const n = h2h.matches;
  const dataOk =
    n >= o.minMatches &&
    h2h.teamAGoalsPerMatch !== null &&
    h2h.teamBGoalsPerMatch !== null &&
    Number.isFinite(h2h.teamAGoalsPerMatch) &&
    Number.isFinite(h2h.teamBGoalsPerMatch);

  if (!dataOk) {
    return { lambdaA, lambdaB, applied: false, matches: n, weight: 0, factorA: null, factorB: null };
  }

  const weight = n / (n + o.priorMatches);
  const adjA = adjustOne(lambdaA, h2h.teamAGoalsPerMatch, weight, o.maxAdjustment);
  const adjB = adjustOne(lambdaB, h2h.teamBGoalsPerMatch, weight, o.maxAdjustment);

  return {
    lambdaA: adjA,
    lambdaB: adjB,
    applied: true,
    matches: n,
    weight,
    factorA: lambdaA !== null && lambdaA > 0 && adjA !== null ? adjA / lambdaA : null,
    factorB: lambdaB !== null && lambdaB > 0 && adjB !== null ? adjB / lambdaB : null,
  };
}
