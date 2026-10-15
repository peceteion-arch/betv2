import { describe, it, expect } from 'vitest';
import { buildOddsFromProbabilities, CORRECT_SCORE_SELECTIONS } from './odds-from-probabilities';
import { calculateMarketProbabilities } from './poisson-market.engine';

const probs = calculateMarketProbabilities(1.5, 1.2);
const find = (lines: any[], market: string, selection: string) =>
  lines.find((l) => l.market === market && l.selection === selection)!;

describe('buildOddsFromProbabilities', () => {
  it('genereaza exact pietele si selectiile din generateOdds (29 de linii)', () => {
    const lines = buildOddsFromProbabilities(probs)!;
    expect(lines.length).toBe(29);
    const expected: Record<string, string[]> = {
      '1X2': ['1', 'X', '2'],
      DUPLA_HIPOTESE: ['1X', 'X2', '12'],
      MARCAS_0_5: ['Mais 0.5', 'Menos 0.5'],
      MARCAS_1_5: ['Mais 1.5', 'Menos 1.5'],
      MARCAS_2_5: ['Mais 2.5', 'Menos 2.5'],
      MARCAS_3_5: ['Mais 3.5', 'Menos 3.5'],
      MARCAS_4_5: ['Mais 4.5', 'Menos 4.5'],
      AMBAS_MARCAM: ['Sim', 'Não'],
      RESULTADO_CORRETO: [...CORRECT_SCORE_SELECTIONS],
      IMPAR_PAR: ['Ímpar', 'Par'],
    };
    for (const [market, sels] of Object.entries(expected)) {
      const got = lines.filter((l) => l.market === market).map((l) => l.selection);
      expect(got.join('|')).toBe(sels.join('|'));
    }
  });

  it('marja: suma 1/cota pe 1X2 este aproape 1 + marja', () => {
    const lines = buildOddsFromProbabilities(probs, { margin: 0.07 })!;
    const sum = ['1', 'X', '2'].reduce((s, k) => s + 1 / find(lines, '1X2', k).value, 0);
    expect(sum).toBeCloseTo(1.07, 1); // toleranta 0.05 (rotunjire la 2 zecimale)
  });

  it('marja 0 => cota ≈ 1 / probabilitate', () => {
    const lines = buildOddsFromProbabilities(probs, { margin: 0 })!;
    const l = find(lines, '1X2', '1');
    expect(l.value).toBeCloseTo(1 / probs.one, 1);
  });

  it('favorita are cota mai mica decat outsiderul', () => {
    const fav = buildOddsFromProbabilities(calculateMarketProbabilities(3, 0.5))!;
    expect(find(fav, '1X2', '1').value).toBeLessThan(find(fav, '1X2', '2').value);
  });

  it('scor exact are marja proprie, mai mare', () => {
    const lines = buildOddsFromProbabilities(probs, { margin: 0.05, correctScoreMargin: 0.2, maxOdds: 1000 })!;
    const l = find(lines, 'RESULTADO_CORRETO', '1-1');
    expect(1 / l.value).toBeCloseTo(probs.exactScores['1-1'] * 1.2, 2);
  });

  it('cotele sunt in [minOdds, maxOdds] si au maxim 2 zecimale', () => {
    const lines = buildOddsFromProbabilities(calculateMarketProbabilities(0.2, 0.1), { minOdds: 1.05, maxOdds: 30 })!;
    for (const l of lines) {
      expect(l.value >= 1.05 && l.value <= 30).toBe(true);
      expect(Math.abs(l.value * 100 - Math.round(l.value * 100)) < 1e-9).toBe(true);
    }
  });

  it('probabilitate 0 => cota maxima (nu Infinity)', () => {
    const lines = buildOddsFromProbabilities(calculateMarketProbabilities(0, 0), { maxOdds: 40 })!;
    expect(find(lines, 'MARCAS_0_5', 'Mais 0.5').value).toBe(40);
  });

  it('model invalid => null', () => {
    expect(buildOddsFromProbabilities(calculateMarketProbabilities(NaN, 1))).toBeNull();
  });

  it('optiuni invalide arunca eroare', () => {
    expect(() => buildOddsFromProbabilities(probs, { margin: -0.1 })).toThrow();
    expect(() => buildOddsFromProbabilities(probs, { margin: 1 })).toThrow();
    expect(() => buildOddsFromProbabilities(probs, { minOdds: 0.5 })).toThrow();
    expect(() => buildOddsFromProbabilities(probs, { minOdds: 5, maxOdds: 3 })).toThrow();
  });
});
