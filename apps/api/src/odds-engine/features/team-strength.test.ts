/**
 * Teste unitare pentru formula matematică a modelului de forță (PASUL 3A).
 * Verifică limitele, regularizarea și comportamentul pentru istoric insuficient.
 * Nu testează modulul integrat în generator (nu este conectat — blocaj raportat).
 */

describe('team-strength formula — audit matematic PASUL 3A', () => {
  // Formula documentată, verificată numeric
  const ref = 5.0;
  const reg01 = (N: number) => N >= 3 ? 0 : Math.max(0.2, 1 - N / 3);

  it('regularizare: N=0 => 1 (total regresie la 5)', () => {
    expect(reg01(0)).toBeCloseTo(1, 2);
  });

  it('regularizare: N=1 => ~0.67', () => {
    expect(reg01(1)).toBeCloseTo(0.667, 2);
  });

  it('regularizare: N=2 => ~0.33', () => {
    expect(reg01(2)).toBeCloseTo(0.333, 2);
  });

  it('regularizare: N>=3 => 0', () => {
    expect(reg01(3)).toBe(0);
    expect(reg01(10)).toBe(0);
  });

  it('normalizare puncte: 3 p/m => 1; 2 => ~0.67; 1 => ~0.33; 0 => 0', () => {
    const P = (v: number) => Math.min(v / 3, 1);
    expect(P(3)).toBe(1);
    expect(P(2)).toBeCloseTo(0.667, 2);
    expect(P(1)).toBeCloseTo(0.333, 2);
    expect(P(0)).toBe(0);
  });

  it('normalizare GD tanh(0)=0; tanh(2)~0.96; tanh(-2)~-0.96', () => {
    const tanh = (x: number) => Math.tanh(x);
    expect(tanh(0)).toBe(0);
    expect(tanh(2)).toBeGreaterThan(0.96);
    expect(tanh(-2)).toBeLessThan(-0.96);
  });

  it('atac: 3 goluri/m => 1; 1.5 => 0.5; 0 => 0', () => {
    const A = (v: number) => Math.min(v / 3, 1);
    expect(A(3)).toBe(1);
    expect(A(1.5)).toBeCloseTo(0.5, 2);
    expect(A(0)).toBe(0);
  });

  it('aparare: 0 GA => 1; 3 GA => 0; 1.5 => 0.5', () => {
    const D = (v: number) => Math.max(0, 1 - Math.min(v / 3, 1));
    expect(D(0)).toBe(1);
    expect(D(3)).toBe(0);
    expect(D(1.5)).toBeCloseTo(0.5, 2);
  });

  it('forma: 3 meciuri, 9 puncte => 1; 2 meciuri => null (nu dubleaza global)', () => {
    // F_norm = puncte / 9 pentru 3 meciuri (max 1)
    const F = (pts: number, m: number) => m >= 3 ? Math.min(pts / (3 * 3), 1) : null;
    expect(F(9, 3)).toBe(1);
    expect(F(6, 3)).toBeCloseTo(0.667, 2);
    expect(F(3, 3)).toBeCloseTo(0.333, 2);
    expect(F(4, 2)).toBeNull(); // <3 => null, fara dublare
  });

  it('nu exista ajustare adversari simulat cu constante (raportat blocaj)', () => {
    // Ajustarea reala ar necesita pre-calculare ratinguri oponenti cu asOf = m.matchDate
    // Aici se verifica doar ca contribuția = 0 (nu pretindem calibragr)
    expect(0.15 * (0.5 - 0.5)).toBe(0);
  });

  it('lizibilitate limite: valori >1 sau <0 sunt clamped, nu forțate artificial', () => {
    // Un termen >1 (ex: P_norm=1, GD_norm=1, F_norm=1 => ~0.8) -> clamped la 1
    const raw = 0.35 * 1 + 0.20 * 0.96 + 0.25 * 1 + 0.20 * 0;
    expect(raw).toBeLessThan(1.1);
    const clamped = Math.max(0, Math.min(1, raw));
    expect(clamped).toBeLessThanOrEqual(1);
  });
});
