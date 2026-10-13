import { describe, it, expect } from 'vitest';
import { poissonProb, exactScoreProb, calculate1X2 } from '../src/odds-engine/features/poisson.utils';

describe('poisson.utils', () => {
  describe('poissonProb', () => {
    it('calculează valori corecte pentru lambda=1', () => {
      // Calcul matematic independent:
      // P(0) = e^-1 * 1^0 / 0! = e^-1 = 0.3678794412
      expect(poissonProb(0, 1)).toBeCloseTo(0.367879441, 9);
      // P(1) = e^-1 * 1^1 / 1! = e^-1 = 0.3678794412
      expect(poissonProb(1, 1)).toBeCloseTo(0.367879441, 9);
      // P(2) = e^-1 * 1^2 / 2! = e^-1 / 2 = 0.18393972058572114
      expect(poissonProb(2, 1)).toBeCloseTo(0.1839397206, 8);
    });

    it('calculează P(X=50) pentru lambda=50', () => {
      // Calcul matematic independent (log-space):
      // ln P(50) = 50 * ln(50) - 50 - ln(50!)
      // ln(50) ≈ 3.912023005
      // 50 * 3.912023005 ≈ 195.6011503
      // ln(50!) ≈ 148.477767
      // ln P = 195.6011503 - 50 - 148.477767 ≈ -2.8766
      // P = exp(-2.8766) ≈ 0.056
      const result = poissonProb(50, 50);
      expect(result).toBeGreaterThan(0.05);
      expect(result).toBeLessThan(0.06);
    });

    it('gestionează lambda=0 - corect', () => {
      expect(poissonProb(0, 0)).toBe(1); // Singurul scor posibil
      expect(poissonProb(1, 0)).toBe(0); // Goluri sunt imposibile
      expect(poissonProb(2, 0)).toBe(0);
    });

    it('respinge k negativ, fracționar și ne-finit', () => {
      expect(poissonProb(-1, 1)).toBe(0);
      expect(poissonProb(1, -1)).toBe(0);
      expect(poissonProb(NaN, 1)).toBe(0);
      expect(poissonProb(Infinity, 1)).toBe(0);
      expect(poissonProb(1.5, 1)).toBe(0);
      expect(poissonProb('a', 1)).toBe(0);
    });

    it('respinge lambda invalid', () => {
      expect(poissonProb(0, -1)).toBe(0);
      expect(poissonProb(1, NaN)).toBe(0);
      expect(poissonProb(2, Infinity)).toBe(0);
      expect(poissonProb(3, undefined)).toBe(0);
    });
  });

  describe('exactScoreProb', () => {
    it('calculează corect scorul 0-0 pentru lambda=1', () => {
      // P(0)*P(0) = 0.367879441^2 = 0.135335283
      expect(exactScoreProb(0, 0, 1, 1)).toBeCloseTo(0.135335283, 9);
    });

    it('calculează scorul 13-1 pentru lambda=1 (corect), dar probabilitatea e mică', () => {
      const prob = exactScoreProb(13, 1, 1, 1);
      expect(prob).toBeGreaterThan(0);
      // P(13) pentru lambda=1 = e^-1 / 13! ≈ 1.16e-11
      // P(13-1) ≈ 1.07e-11
      expect(prob).toBeLessThan(1e-10);
    });

    it('respinge scoruri fracționare', () => {
      expect(exactScoreProb(0.5, 1, 1, 1)).toBe(0);
      expect(exactScoreProb(1, 0.5, 1, 1)).toBe(0);
      expect(exactScoreProb(1.5, 1.5, 1, 1)).toBe(0);
      expect(exactScoreProb(2.7, 3.3, 1, 1)).toBe(0);
    });

    it('respinde parametri invalizi sau NaN', () => {
      expect(exactScoreProb(-1, 0, 1, 1)).toBe(0);
      expect(exactScoreProb(0, -1, 1, 1)).toBe(0);
      expect(exactScoreProb(NaN, 0, 1, 1)).toBe(0);
      expect(exactScoreProb(0, NaN, 1, 1)).toBe(0);
      expect(exactScoreProb(Infinity, 0, 1, 1)).toBe(0);
      expect(exactScoreProb(0, Infinity, 1, 1)).toBe(0);
    });
  });

  describe('calculate1X2 (Adaptive Limits)', () => {
    it('returnează probabilitățile corecte pentru lambda=1', () => {
      const res = calculate1X2(1, 1);
      // Valori verificate matematic pentru lambda=1:
      // P(1) ≈ 0.3457458408, P(X) ≈ 0.3085083195, P(2) ≈ 0.3457458408
      expect(res.one).toBeCloseTo(0.34574584, 8);
      expect(res.draw).toBeCloseTo(0.30850832, 8);
      expect(res.two).toBeCloseTo(0.34574584, 8);
    });

    it('convergeț la toleranța specificată pentru lambda=1', () => {
      const res = calculate1X2(1, 1, 1e-10);
      expect(res.converged).toBe(true);
      expect(res.excludedProb).toBeLessThan(1e-9);
    });

    it('rezultatele sunt non-NaN și finite', () => {
      const res = calculate1X2(1, 1);
      expect(Number.isFinite(res.one)).toBe(true);
      expect(Number.isFinite(res.draw)).toBe(true);
      expect(Number.isFinite(res.two)).toBe(true);
      expect(Number.isFinite(res.excludedProb)).toBe(true);
      expect(Number.isFinite(res.limitInfo.maxHome)).toBe(true);
      expect(Number.isFinite(res.limitInfo.maxAway)).toBe(true);
      expect(Number.isFinite(res.limitInfo.errorEstimate)).toBe(true);
    });

    it('suma 1+X+2+excludedProb ≈ 1 (integritate probabilisică)', () => {
      const res = calculate1X2(1, 1);
      expect(res.one + res.draw + res.two + res.excludedProb).toBeCloseTo(1, 10);
    });

    it('respinge lambda negativ cu señalarea erorii', () => {
      const res = calculate1X2(-1, 1);
      expect(res.one).toBe(0);
      expect(res.draw).toBe(0);
      expect(res.two).toBe(0);
      expect(res.excludedProb).toBe(1);
      expect(res.converged).toBe(false);
    });

    it('respinge NaN cu señalarea erorii', () => {
      const res = calculate1X2(NaN, 1);
      expect(res.one).toBe(0);
      expect(res.converged).toBe(false);
    });

    it('gestionează lambda mare conform 1X2=1', () => {
      const res = calculate1X2(10, 10);
      expect(res.one + res.draw + res.two + res.excludedProb).toBeCloseTo(1, 8);
      expect(res.converged).toBe(true);
      expect(res.limitInfo.maxHome).toBeGreaterThan(10);
    });

    it('gestionează lambda extrem de mari (50, 50) - convergență', () => {
      const res = calculate1X2(50, 50);
      expect(res.one + res.draw + res.two + res.excludedProb).toBeCloseTo(1, 6);
      expect(res.converged).toBe(true);
      // Verificăm că granițele au fost ajustate
      expect(res.limitInfo.maxHome).toBeGreaterThan(40);
      expect(res.limitInfo.maxAway).toBeGreaterThan(40);
    });

    it('lambda 100 cu limita foarte mica - convergenta esueaza', () => {
      // Limita absoluta de 30 este prea mica pentru lambda=100, deci nu se atinge toleranta
      const res = calculate1X2(100, 100, 1e-15, 30);
      // Nu convergem din cauza limitei de 30
      expect(res.converged).toBe(false);
      expect(res.one + res.draw + res.two + res.excludedProb).toBeLessThan(1.0000000001);
      expect(res.limitInfo.maxHome).toBeLessThanOrEqual(30);
      expect(res.limitInfo.errorEstimate).toBeGreaterThan(0);
    });

    it('asimetrie extremă (0.1 - 10) rezolvă corect', () => {
      const res = calculate1X2(0.1, 10);
      expect(res.two).toBeGreaterThan(res.one);
      expect(res.one + res.draw + res.two + res.excludedProb).toBeCloseTo(1, 8);
    });

    it('verifică raportarea detaliată a limitelor în limitInfo', () => {
      const res = calculate1X2(5, 3);
      expect(res.limitInfo).toBeDefined();
      expect(res.limitInfo.maxHome).toBeGreaterThanOrEqual(10);
      expect(res.limitInfo.maxAway).toBeGreaterThanOrEqual(10);
      expect(res.limitInfo.maxHome).toBeLessThanOrEqual(100);
      expect(res.limitInfo.maxAway).toBeLessThanOrEqual(100);
      expect(typeof res.limitInfo.excludedMass).toBe('number');
      expect(typeof res.limitInfo.errorEstimate).toBe('number');
    });
  });

  describe('Integritate numerică', () => {
    it('nu produce Infinity în calculele de bază', () => {
      const res = calculate1X2(1, 1);
      expect(res.one !== Infinity && res.one !== -Infinity && res.draw !== Infinity && res.two !== Infinity).toBe(true);
    });

    it('nu produce NaN în calculele de bază', () => {
      const res = calculate1X2(1, 1);
      expect(!Number.isNaN(res.one) && !Number.isNaN(res.draw) && !Number.isNaN(res.two)).toBe(true);
    });

    it('P(15, 15) pentru lambda=15 este finit și mic', () => {
      const prob = poissonProb(15, 15);
      expect(prob).toBeGreaterThan(0);
      expect(prob).toBeLessThan(0.11);
      expect(Number.isFinite(prob)).toBe(true);
    });
  });
});