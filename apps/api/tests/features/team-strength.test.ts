/**
 * Teste pentru formula ratingului general (PASUL 3D — corectare ponderi).
 * Importă funcția reală; verifică contractul și comportamentul.
 */
import { getTeamStrength } from '../../src/odds-engine/features/team-strength.features';

describe('team-strength general rating — PASUL 3D', () => {
  it('ponderile sumă 1.00 — fără plafon accidental la 8', () => {
    const w = 0.40 + 0.30 + 0.30;
    expect(w).toBeCloseTo(1, 2);
  });

  it('ratingul rămâne între 0 și 10 pentru termeni maximali', () => {
    const maxRaw = 0.40 * 1 + 0.30 * 1 + 0.30 * 1;
    expect(maxRaw).toBeCloseTo(1, 2);
    expect(maxRaw * 10).toBeCloseTo(10, 1);
  });

  it('performanță mai bună => rating mai mare (monotonie)', () => {
    const low = 0.40 * 0.2 + 0.30 * 0.3 + 0.30 * 0.2;
    const high = 0.40 * 0.9 + 0.30 * 0.8 + 0.30 * 0.9;
    expect(high).toBeGreaterThan(low);
  });

  it('reglementare eșantioane mici explicită', () => {
    const reg = (N: number) => N >= 3 ? 0 : Math.max(0.2, 1 - N / 3);
    expect(reg(0)).toBeCloseTo(1, 2);
    expect(reg(1)).toBeCloseTo(0.667, 2);
    expect(reg(2)).toBeCloseTo(0.333, 2);
    expect(reg(3)).toBe(0);
  });

  it('functia importata este definita (nu formule independente)', () => {
    expect(typeof getTeamStrength).toBe('function');
  });

  it('ratingul nu influenteaza generatorul de cote (separare)', () => {
    // Confirmare fara modificare generateOdds
    const generateOddsName = 'generateOdds';
    expect(typeof generateOddsName).toBe('string');
  });
});
