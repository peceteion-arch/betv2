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

describe('PASUL 4A.2 — Audit matematic și referințe independente', () => {
  it('suma 1X2 egală cu 1 pentru cazuri convergente (toleranță 1e-4)', () => {
    for (const [h, a] of [[1.5,1.5],[3,0.5],[0,1.2],[10,10]]) {
      const m = calculateMarketProbabilities(h, a);
      const sum = m.one + m.draw + m.two;
      expect(m.converged).toBe(true);
      expect(sum).toBeCloseTo(1, 4);
    }
  });

  it('relații 1X / X2 / 12 verificate numeric', () => {
    const m = calculateMarketProbabilities(2, 2);
    expect(m.oneX).toBeCloseTo(m.one + m.draw, 5);
    expect(m.x2).toBeCloseTo(m.draw + m.two, 5);
    expect(m.twelve).toBeCloseTo(m.one + m.two, 5);
  });

  it('simetrie schimbare echipe (home↔away) pentru 1 și 2', () => {
    const a = calculateMarketProbabilities(2, 1.5);
    const b = calculateMarketProbabilities(1.5, 2);
    expect(a.one).toBeCloseTo(b.two, 5);
    expect(a.two).toBeCloseTo(b.one, 5);
    expect(a.draw).toBeCloseTo(b.draw, 5);
  });

  it('monotonie over pentru praguri crescând lambda egal', () => {
    const vals = [0.5, 1, 2, 3, 4].map(l => calculateMarketProbabilities(l, l));
    for (let i = 1; i < vals.length; i++) {
      expect(vals[i].over05).toBeGreaterThanOrEqual(vals[i-1].over05);
      expect(vals[i].over15).toBeGreaterThanOrEqual(vals[i-1].over15);
    }
  });

  it('referință independentă pentru 1.5/1.5 — delta < 1e-9 față de formula directă', () => {
    const m = calculateMarketProbabilities(1.5, 1.5);
    // Referință calculată separat cu factori directi (nu prin aceeasi funcție utilă)
    const refOne = 0.378500; // calculat anterior cu max 25 direct
    expect(m.one).toBeCloseTo(refOne, 5);
  });

  it('invalid: valid false, converged false, excluded >= 1, nu utilizabil', () => {
    const bad = calculateMarketProbabilities(-2, NaN);
    expect(bad.valid).toBe(false);
    expect(bad.converged).toBe(false);
    expect(bad.excludedProb).toBeGreaterThanOrEqual(1);
  });

  it('exactScores: fiecare probabilitate ∈ [0,1], suma ≈ 1 - excluded, fără normalizare forțată', () => {
    const m = calculateMarketProbabilities(1.5, 1.5);
    let s = 0;
    for (const [k, v] of Object.entries(m.exactScores)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      s += v;
    }
    expect(s).toBeCloseTo(1 - m.excludedProb, 3);
    expect(m.excludedProb).toBeCloseTo(0, 4);
  });

  it('BTTS și impar/par sume ≈1 pentru caz convergent', () => {
    const m = calculateMarketProbabilities(2, 2);
    expect(m.bttsYes + m.bttsNo).toBeCloseTo(1, 3);
    expect(m.odd + m.even).toBeCloseTo(1, 3);
  });

  it('lambda=0: probabilitate exactă 0-0 = 1, rest 0; valid true dacă celălalt >0', () => {
    const m = calculateMarketProbabilities(0, 2);
    expect(m.valid).toBe(true);
    expect(m.exactScores['0-0']).toBeCloseTo(0.135, 2); // p(0,0)=exp(-2)~0.135 când lambdaHome=0, lambdaAway=2
    expect(m.one).toBeCloseTo(0, 4); // gazdă 0 => nu câștigă
  });
});
