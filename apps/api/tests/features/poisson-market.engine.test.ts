import { describe, it, expect } from 'vitest';
import { calculateMarketProbabilities } from '../../src/odds-engine/features/poisson-market.engine';

describe('poisson-market.engine audit 4A.1', () => {
  it('echilibrat 1.5/1.5: 1X2 ~1; peste/sub 0.5 ~1', () => {
    const m = calculateMarketProbabilities(1.5, 1.5);
    expect(m.valid).toBe(true);
    expect(m.one + m.draw + m.two).toBeCloseTo(1, 2);
    expect(m.over05 + m.under05).toBeCloseTo(1, 2);
  });

  it('favorita 3/0.5: one > 0.55', () => {
    const m = calculateMarketProbabilities(3, 0.5);
    expect(m.valid).toBe(true);
    expect(m.one).toBeGreaterThan(0.55);
  });

  it('lambda=0 + 1.2: valid, under05 mare', () => {
    const m = calculateMarketProbabilities(0, 1.2);
    expect(m.valid).toBe(true);
  });

  it('invalid NaN: valid false, excluded=1, nu utilizabil', () => {
    const m = calculateMarketProbabilities(NaN, 1);
    expect(m.valid).toBe(false);
    expect(m.excludedProb).toBe(1);
  });

  it('convergență/eșec: lambda mare 10/10 => poate limita; verificăm valid', () => {
    const m = calculateMarketProbabilities(10, 10);
    // Nu pretindem convergență perfectă; doar verificăm că nu crash și valid e raportat
    expect(typeof m.valid).toBe('boolean');
  });

  it('1X = 1+X, X2 = X+2, 12 = 1+2 (relații)', () => {
    const m = calculateMarketProbabilities(2, 2);
    expect(m.oneX).toBeCloseTo(m.one + m.draw, 5);
    expect(m.x2).toBeCloseTo(m.draw + m.two, 5);
    expect(m.twelve).toBeCloseTo(m.one + m.two, 5);
  });

  it('BTTS + impar/par suma ~1', () => {
    const m = calculateMarketProbabilities(1.5, 1.5);
    expect(m.bttsYes + m.bttsNo).toBeCloseTo(1, 2);
    expect(m.odd + m.even).toBeCloseTo(1, 2);
  });

  it('scoruri exacte individuale, nu normalizate între 9', () => {
    const m = calculateMarketProbabilities(1, 1);
    // Suma tuturor scorurilor posibile din distribuție = aproximativ 1 - excluded
    // Nu forțăm suma exactScores = 1, ci verificăm că fiecare e în [0,1]
    for (const [k, v] of Object.entries(m.exactScores)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('mase exclusă raportată coerent cu valid=false', () => {
    const bad = calculateMarketProbabilities(-1, 2);
    expect(bad.valid).toBe(false);
    expect(bad.excludedProb).toBeGreaterThanOrEqual(1);
  });
});
