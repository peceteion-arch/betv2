import type { MarketProbabilities } from './poisson-market.engine';

/**
 * Transforma probabilitatile unui meci in COTE pentru piețele aplicatiei,
 * cu marja casei. Functie pura (fara baza de date).
 *
 * Numele pietelor si selectiilor sunt EXACT cele din match.service.generateOdds
 * si din lib/settlement.ts, ca sa poata inlocui cotele generate acolo.
 * ('1' = prima echipa din meci, '2' = a doua; fara avantaj de teren.)
 *
 * Formula, pentru fiecare selectie: cota = 1 / (p * (1 + marja)), apoi
 *   - limitata la [minOdds, maxOdds] (probabilitati foarte mici/mari nu dau cote absurde),
 *   - rotunjita la 2 zecimale (coloana Odds.value este Decimal(10, 2)).
 * Pentru o piata cu rezultate exclusive (1X2, Peste/Sub...), suma 1/cota ≈ 1 + marja.
 * "Scor exact" acopera doar 9 scoruri din multe posibile, deci are marja proprie, mai mare.
 */

export interface OddsLine {
  market: string;
  selection: string;
  value: number;
  /** Probabilitatea modelului (fara marja), pentru audit / afisare in Admin. */
  probability: number;
}

export interface OddsFromProbabilitiesOptions {
  /** Marja casei pentru piețele obisnuite (0.07 = 7%). Default 0.07. */
  margin?: number;
  /** Marja pentru piata RESULTADO_CORRETO. Default 0.15. */
  correctScoreMargin?: number;
  /** Cota minima afisata. Default 1.01. */
  minOdds?: number;
  /** Cota maxima afisata. Default 50. */
  maxOdds?: number;
}

const DEFAULTS = { margin: 0.07, correctScoreMargin: 0.15, minOdds: 1.01, maxOdds: 50 };

export const CORRECT_SCORE_SELECTIONS = ['1-0', '2-0', '2-1', '0-0', '1-1', '2-2', '0-1', '0-2', '1-2'] as const;

function toOdds(p: number, margin: number, minOdds: number, maxOdds: number): number {
  if (!Number.isFinite(p) || p <= 0) return maxOdds;
  const raw = 1 / (p * (1 + margin));
  const clamped = Math.min(maxOdds, Math.max(minOdds, raw));
  return Math.round(clamped * 100) / 100;
}

/**
 * Intoarce lista de cote sau null daca probabilitatile nu sunt utilizabile
 * (model neconvergent / invalid) — apelantul decide fallback-ul.
 */
export function buildOddsFromProbabilities(
  p: MarketProbabilities,
  options: OddsFromProbabilitiesOptions = {}
): OddsLine[] | null {
  const o = { ...DEFAULTS, ...options };
  if (!(o.margin >= 0 && o.margin < 1)) throw new RangeError('margin trebuie sa fie in [0, 1)');
  if (!(o.correctScoreMargin >= 0 && o.correctScoreMargin < 1)) {
    throw new RangeError('correctScoreMargin trebuie sa fie in [0, 1)');
  }
  if (!(o.minOdds >= 1)) throw new RangeError('minOdds trebuie sa fie >= 1');
  if (!(o.maxOdds > o.minOdds)) throw new RangeError('maxOdds trebuie sa fie > minOdds');

  if (!p.valid || !p.converged) return null;

  const lines: OddsLine[] = [];
  const add = (market: string, selection: string, prob: number, margin = o.margin) => {
    lines.push({ market, selection, value: toOdds(prob, margin, o.minOdds, o.maxOdds), probability: prob });
  };

  add('1X2', '1', p.one);
  add('1X2', 'X', p.draw);
  add('1X2', '2', p.two);

  add('DUPLA_HIPOTESE', '1X', p.oneX);
  add('DUPLA_HIPOTESE', 'X2', p.x2);
  add('DUPLA_HIPOTESE', '12', p.twelve);

  add('MARCAS_0_5', 'Mais 0.5', p.over05);
  add('MARCAS_0_5', 'Menos 0.5', p.under05);
  add('MARCAS_1_5', 'Mais 1.5', p.over15);
  add('MARCAS_1_5', 'Menos 1.5', p.under15);
  add('MARCAS_2_5', 'Mais 2.5', p.over25);
  add('MARCAS_2_5', 'Menos 2.5', p.under25);
  add('MARCAS_3_5', 'Mais 3.5', p.over35);
  add('MARCAS_3_5', 'Menos 3.5', p.under35);
  add('MARCAS_4_5', 'Mais 4.5', p.over45);
  add('MARCAS_4_5', 'Menos 4.5', p.under45);

  add('AMBAS_MARCAM', 'Sim', p.bttsYes);
  add('AMBAS_MARCAM', 'Não', p.bttsNo);

  for (const score of CORRECT_SCORE_SELECTIONS) {
    add('RESULTADO_CORRETO', score, p.exactScores[score] ?? 0, o.correctScoreMargin);
  }

  add('IMPAR_PAR', 'Ímpar', p.odd);
  add('IMPAR_PAR', 'Par', p.even);

  return lines;
}
