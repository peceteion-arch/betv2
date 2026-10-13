import { describe, it, expect } from 'vitest';
import { poissonProb, exactScoreProb, calculate1X2 } from '../src/odds-engine/features/poisson.utils';

describe('poisson.utils', () => {
  describe('poissonProb', () => {
    it('calculează valori corecte pentru lambda=1', () => {
      // P(0) = e^-1 * 1^0 / 0! = 0.367879441
      expect(poissonProb(0, 1)).toBeCloseTo(0.367879441, 8);
      // P(1) = e^-1 * 1^1 / 1! = 0.367879441
      expect(poissonProb(1, 1)).toBeCloseTo(0.367879441, 8);
      // P(2) = e^-1 * 1^2 / 2! = 0.18393972
      expect(poissonProb(2, 1)).toBeCloseTo(0.18393972, 8);
    });

    it('gestionează lambda=0', () => {
      expect(poissonProb(0, 0)).toBe(1);
      expect(poissonProb(1, 0)).toBe(0);
      expect(poissonProb(2, 0)).toBe(0);
    });

    it('gestionează parametri invalizi', () => {
      expect(poissonProb(-1, 1)).toBe(0);
      expect(poissonProb(1, -1)).toBe(0);
      expect(poissonProb(NaN, 1)).toBe(0);
      expect(poissonProb(1, Infinity)).toBe(0);
    });

    it('menține stabilitatea la lambda mare', () => {
      // P(50) pentru lambda=50
      // ln(P(50)) = 50 * ln(50) - 50 - ln(50!)
      // ln(50!) approx 148.477767
      // 50 * 3.912023 - 50 - 148.477767 = 195.60115 - 50 - 148.477767 = -2.8766
      // exp(-2.8766) approx 0.056
      expect(poissonProb(50, 50)).toBeGreaterThan(0);
      expect(poissonProb(50, 50)).toBeLessThan(0.1);
    });
  });

  describe('exactScoreProb', () => {
    it('calculează corect scorul 0-0 pentru lambda=1', () => {
      expect(exactScoreProb(0, 0, 1, 1)).toBeCloseTo(0.13533528, 8);
    });

    it('gestionează scoruri mari', () => {
      const prob = exactScoreProb(15, 1, 1, 1);
      expect(prob).toBeGreaterThan(0);
      expect(prob).toBeLessThan(0.000001);
    });
  });

  describe('calculate1X2 (Adaptive Limits)', () => {
    it('returnează probabilitățile 1, X, 2 corecte pentru lambda=1', () => {
      const res = calculate1X2(1, 1);
      // Valori verificate matematic pentru lambda=1:
      // P(1) ≈ 0.34574584, P(X) ≈ 0.30850832, P(2) ≈ 0.34574584
      expect(res.one).toBeCloseTo(0.34574584, 6);
      expect(res.draw).toBeCloseTo(0.30850832, 6);
      expect(res.two).toBeCloseTo(0.34574584, 6);
      expect(res.excludedProb).toBeLessThan(1e-7);
    });

    it('respectă masa cumulată pentru lambda=1 (P(0..9) check)', () => {
      const res = calculate1X2(1, 1);
      // P(0..9) pentru lambda=1 este ~0.9999998886
      // Masa exclusă în 1X2 este restul din matrice.
      // Totuși, limita adaptivă trebuie să asigure că 1+X+2 + excludedProb ≈ 1
      expect(res.one + res.draw + res.two + res.excludedProb).toBeCloseTo(1, 10);
    });

    it('gestionează lambda=0', () => {
      const res = calculate1X2(0, 0);
      // Dacă lambda=0, singurul scor posibil e 0-0 (Prob=1)
      expect(res.draw).toBeCloseTo(1, 8);
      expect(res.one).toBe(0);
      expect(res.two).toBe(0);
      expect(res.excludedProb).toBe(0);
    });

    it('gestionează lambda mari (ex: lambda=10)', () => {
      const res = calculate1X2(10, 10);
      expect(res.one + res.draw + res.two + res.excludedProb).toBeCloseTo(1, 8);
      expect(res.limitInfo.maxHome).toBeGreaterThan(10);
      expect(res.limitInfo.maxAway).toBeGreaterThan(10);
    });

    it('gestionează lambda extrem de mari (ex: lambda=50)', () => {
      const res = calculate1X2(50, 50);
      expect(res.one + res.draw + res.two + res.excludedProb).toBeCloseTo(1, 6);
      expect(res.limitInfo.maxHome).toBeGreaterThan(40);
    });

    it('gestionează asimetrie extremă', () => {
      const res = calculate1X2(0.1, 10);
      expect(res.two).toBeGreaterThan(res.one);
      expect(res.one + res.draw + res.two + res.excludedProb).toBeCloseTo(1, 8);
    });

    it('verifică limitarea de siguranță (absoluteMaxLimit)', () => {
      const res = calculate1X2(100, 100, 1e-12, 20); // Limită foarte mică
      expect(res.limitInfo.maxHome).toBeLessThanOrEqual(20);
      expect(res.limitInfo.maxAway).toBeLessThanOrEqual(20);
    });

    it('menține stabilitatea pentru intrări invalide', () => {
      expect(calculate1X2(-1, 1).one).toBe(0);
      expect(calculate1X2(1, -1).two).toBe(0);
      expect(calculate1X2(NaN, 1).one).toBe(0);
    });
  });
});
