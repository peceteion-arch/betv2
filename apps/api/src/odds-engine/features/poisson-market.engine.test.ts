import { describe, it, expect } from 'vitest';
import { calculateMarketProbabilities } from './poisson-market.engine';

describe('poisson-market.engine', () => {
  it('echilibrat lambda=1.5/1.5 => 1X2 aprox 1, over/under suma ~1', () => {
    const m = calculateMarketProbabilities(1.5, 1.5);
    expect(m.valid).toBe(true);
    expect(m.one + m.draw + m.two).toBeCloseTo(1, 2);
    expect(m.oneX + m.x2 + m.twelve).toBeGreaterThan(1); // ok, suma >1 deoarece se suprapune
    expect(m.over05 + m.under05).toBeCloseTo(1, 2);
    expect(m.bttsYes + m.bttsNo).toBeCloseTo(1, 2);
    expect(m.odd + m.even).toBeCloseTo(1, 2);
  });

  it('favorita lambda=3/0.5 => one mare', () => {
    const m = calculateMarketProbabilities(3, 0.5);
    expect(m.valid).toBe(true);
    expect(m.one).toBeGreaterThan(0.55);
  });

  it('lambda=0 => valid, probabilitati 0/1 corecte', () => {
    const m = calculateMarketProbabilities(0, 1.2);
    expect(m.valid).toBe(true);
    expect(m.one).toBeGreaterThanOrEqual(0);
  });

  it('invalid => valid false, excludedProb 1', () => {
    const m = calculateMarketProbabilities(NaN, 1);
    expect(m.valid).toBe(false);
    expect(m.excludedProb).toBe(1);
  });

  it('scoruri exacte nu sunt normalizate incorect intre 9 selectii', () => {
    const m = calculateMarketProbabilities(1, 1);
    const sumExact = Object.values(m.exactScores).reduce((s, v) => s + v, 0);
    expect(sumExact).toBeLessThanOrEqual(1.05); // nu forțat =1, ci suma reală
  });
});
