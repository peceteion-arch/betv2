import { describe, it, expect } from 'vitest';
import { applyH2HAdjustment } from '../h2h-adjustment.features';

const h2h = (matches: number, a: number | null, b: number | null) => ({
  matches,
  teamAGoalsPerMatch: a,
  teamBGoalsPerMatch: b,
});

describe('applyH2HAdjustment', () => {
  it('sub 3 meciuri directe => nicio schimbare', () => {
    const r = applyH2HAdjustment(2, 1.5, h2h(2, 5, 0));
    expect(r.applied).toBe(false);
    expect(r.lambdaA).toBe(2);
    expect(r.lambdaB).toBe(1.5);
    expect(r.weight).toBe(0);
  });

  it('fara meciuri directe => nicio schimbare', () => {
    const r = applyH2HAdjustment(2, 1.5, h2h(0, null, null));
    expect(r.applied).toBe(false);
    expect(r.lambdaA).toBe(2);
  });

  it('ajustaj mic (necapat): n=3, w = 3/13', () => {
    const r = applyH2HAdjustment(2, 2, h2h(3, 2.1, 1.9), { maxAdjustment: 0.5 });
    const w = 3 / 13;
    expect(r.applied).toBe(true);
    expect(r.weight).toBeCloseTo(w, 12);
    expect(r.lambdaA!).toBeCloseTo(2 + w * 0.1, 12);
    expect(r.lambdaB!).toBeCloseTo(2 - w * 0.1, 12);
  });

  it('plafon +10%: H2H cu mult peste model nu poate depasi lambda * 1.1', () => {
    const r = applyH2HAdjustment(2, 2, h2h(5, 9, 0));
    expect(r.lambdaA!).toBeCloseTo(2.2, 12);
    expect(r.lambdaB!).toBeCloseTo(1.8, 12);
    expect(r.factorA!).toBeCloseTo(1.1, 12);
    expect(r.factorB!).toBeCloseTo(0.9, 12);
  });

  it('greutatea creste cu numarul de meciuri', () => {
    const few = applyH2HAdjustment(2, 2, h2h(3, 2.4, 2), { maxAdjustment: 1 });
    const many = applyH2HAdjustment(2, 2, h2h(30, 2.4, 2), { maxAdjustment: 1 });
    expect(many.weight).toBeGreaterThan(few.weight);
    expect(many.lambdaA!).toBeGreaterThan(few.lambdaA!);
  });

  it('lambda null ramane null, lambda 0 ramane 0', () => {
    const r = applyH2HAdjustment(null, 0, h2h(5, 3, 3));
    expect(r.lambdaA).toBeNull();
    expect(r.lambdaB).toBe(0);
    expect(r.factorA).toBeNull();
    expect(r.factorB).toBeNull();
  });

  it('medii H2H null cu meciuri > 0 (date invalide) => nicio schimbare', () => {
    const r = applyH2HAdjustment(2, 2, h2h(5, null, 1));
    expect(r.applied).toBe(false);
    expect(r.lambdaA).toBe(2);
  });

  it('optiuni invalide arunca eroare', () => {
    expect(() => applyH2HAdjustment(1, 1, h2h(5, 1, 1), { minMatches: 0 })).toThrow();
    expect(() => applyH2HAdjustment(1, 1, h2h(5, 1, 1), { maxAdjustment: 2 })).toThrow();
    expect(() => applyH2HAdjustment(1, 1, h2h(5, 1, 1), { priorMatches: -1 })).toThrow();
  });
});
