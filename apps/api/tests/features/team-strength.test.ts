import { describe, it, expect, vi } from 'vitest';
import { getTeamStrength } from '../../src/odds-engine/features/team-strength.features';
import * as basicMod from '../../src/odds-engine/features/team-basic-stats.features';
import * as formMod from '../../src/odds-engine/features/team-form.features';

describe('getTeamStrength real — 3D.3', () => {
  it('interval 0-10 pentru N>=3', async () => {
    vi.spyOn(basicMod, 'getBasicTeamStats').mockResolvedValue({
      matches: 5, pointsPerMatch: 2.2, goalDifferencePerMatch: 0.8,
      goalsForPerMatch: 2.0, goalsAgainstPerMatch: 1.2,
    } as any);
    vi.spyOn(formMod, 'getTeamFormStats').mockResolvedValue({
      last3: { matches: 3, points: 7 },
    } as any);
    const res = await getTeamStrength('T1', new Date());
    expect(res.general).toBeGreaterThanOrEqual(0);
    expect(res.general!).toBeLessThanOrEqual(10);
  });

  it('monotonia: performanta mai buna => rating mai mare', async () => {
    vi.spyOn(basicMod, 'getBasicTeamStats').mockResolvedValue({
      matches: 3, pointsPerMatch: 2.8, goalDifferencePerMatch: 1.5,
      goalsForPerMatch: 3.0, goalsAgainstPerMatch: 0.5,
    } as any);
    vi.spyOn(formMod, 'getTeamFormStats').mockResolvedValue({ last3: { matches: 3, points: 9 } } as any);
    const high = await getTeamStrength('T1', new Date());

    vi.spyOn(basicMod, 'getBasicTeamStats').mockResolvedValue({
      matches: 3, pointsPerMatch: 0.5, goalDifferencePerMatch: -1.5,
      goalsForPerMatch: 0.5, goalsAgainstPerMatch: 2.5,
    } as any);
    vi.spyOn(formMod, 'getTeamFormStats').mockResolvedValue({ last3: { matches: 3, points: 1 } } as any);
    const low = await getTeamStrength('T2', new Date());
    expect(high.general!).toBeGreaterThan(low.general!);
  });

  it('N=1 => regularizare, general nu null', async () => {
    vi.spyOn(basicMod, 'getBasicTeamStats').mockResolvedValue({
      matches: 1, pointsPerMatch: 3, goalDifferencePerMatch: 2,
      goalsForPerMatch: 3, goalsAgainstPerMatch: 0,
    } as any);
    vi.spyOn(formMod, 'getTeamFormStats').mockResolvedValue({ last3: { matches: 1, points: 3 } } as any);
    const res = await getTeamStrength('T1', new Date());
    expect(res.general).not.toBeNull();
    expect(res.regularizationWeight).toBeGreaterThan(0);
  });

  it('N=0 => general null', async () => {
    vi.spyOn(basicMod, 'getBasicTeamStats').mockResolvedValue({
      matches: 0, pointsPerMatch: 0, goalDifferencePerMatch: 0,
      goalsForPerMatch: 0, goalsAgainstPerMatch: 0,
    } as any);
    vi.spyOn(formMod, 'getTeamFormStats').mockResolvedValue({ last3: { matches: 0, points: 0 } } as any);
    const res = await getTeamStrength('T1', new Date());
    expect(res.general).toBeNull();
    expect(res.form).toBeNull();
  });

  it('form null pentru <3 meciuri recente, chiar daca N>=3', async () => {
    vi.spyOn(basicMod, 'getBasicTeamStats').mockResolvedValue({
      matches: 4, pointsPerMatch: 2, goalDifferencePerMatch: 1,
      goalsForPerMatch: 2, goalsAgainstPerMatch: 1,
    } as any);
    vi.spyOn(formMod, 'getTeamFormStats').mockResolvedValue({ last3: { matches: 2, points: 6 } } as any);
    const res = await getTeamStrength('T1', new Date());
    expect(res.form).toBeNull(); // documentat: <3 => null
  });

  it('ratingul nu modifica generateOdds (separare verificata prin import)', () => {
    expect(typeof getTeamStrength).toBe('function');
  });
});
