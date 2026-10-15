import { describe, it, expect } from 'vitest';
import { computeTeamRatings, expectedGoalsFromRatings, capGoalDifference } from './team-ratings.features';
import { NormalizedMatch } from '../providers/match-history.types';

let seq = 0;
function match(
  home: string, away: string, hs: number | null, as: number | null,
  over: Partial<NormalizedMatch> = {}
): NormalizedMatch {
  seq += 1;
  return {
    matchId: `m${String(seq).padStart(4, '0')}`,
    homeTeamId: home, awayTeamId: away, homeTeamName: home, awayTeamName: away,
    competitionId: 'c1', matchday: 1,
    matchDate: new Date(2026, 8, 1, 0, seq), // cronologic crescator
    status: 'FINISHED', homeScore: hs, awayScore: as, ...over,
  };
}
const asOf = new Date('2026-12-01');

describe('capGoalDifference', () => {
  it('limiteaza diferenta, pastreaza pierzatorul', () => {
    expect(capGoalDifference(9, 0, 5)).toEqual({ gf: 5, ga: 0 });
    expect(capGoalDifference(0, 9, 5)).toEqual({ gf: 0, ga: 5 });
    expect(capGoalDifference(8, 4, 5)).toEqual({ gf: 8, ga: 4 }); // diferenta 4 <= 5
    expect(capGoalDifference(3, 1, 5)).toEqual({ gf: 3, ga: 1 });
  });
});

describe('computeTeamRatings — baza', () => {
  it('liga perfect echilibrata (toate 1-1) => toate ratingurile = 1', () => {
    const r = computeTeamRatings([match('A', 'B', 1, 1), match('B', 'C', 1, 1), match('C', 'A', 1, 1)], asOf);
    for (const t of ['A', 'B', 'C']) {
      expect(r.ratings.get(t)!.attack).toBeCloseTo(1, 8);
      expect(r.ratings.get(t)!.defense).toBeCloseTo(1, 8);
    }
    expect(r.converged).toBe(true);
  });

  it('ignora meciuri neeligibile (SCHEDULED, la asOf, in viitor)', () => {
    const r = computeTeamRatings([
      match('A', 'B', 2, 1),
      match('A', 'B', null, null, { status: 'SCHEDULED' }),
      match('A', 'B', 9, 0, { matchDate: new Date('2026-12-01') }),
      match('A', 'B', 9, 0, { matchDate: new Date('2027-01-01') }),
    ], asOf);
    expect(r.ratings.get('A')!.matchesUsed).toBe(1);
  });

  it('fara meciuri => niciun rating', () => {
    const r = computeTeamRatings([], asOf);
    expect(r.ratings.size).toBe(0);
    expect(r.baselineGoals).toBeNull();
  });

  it('toate 0-0 => ratinguri 1, baza 0, lambda null', () => {
    const r = computeTeamRatings([match('A', 'B', 0, 0)], asOf);
    expect(r.ratings.get('A')!.attack).toBe(1);
    expect(expectedGoalsFromRatings(r, 'A', 'B').lambdaA).toBeNull();
  });

  it('optiuni invalide arunca eroare', () => {
    expect(() => computeTeamRatings([], asOf, { halfLifeMatches: 0 })).toThrow();
    expect(() => computeTeamRatings([], asOf, { otherCompetitionWeight: 2 })).toThrow();
  });
});

describe('computeTeamRatings — ajustare dupa adversar (cazul locul 5 vs locurile 9-12)', () => {
  // T1, T2 = echipe de top; A = bate categoric echipele slabe; B = le bate mai putin;
  // W1..W3 = echipe slabe (pierd cu toate).
  const data: NormalizedMatch[] = [];
  for (const w of ['W1', 'W2', 'W3']) {
    data.push(match('T1', w, 3, 0), match('T2', w, 3, 0), match('A', w, 5, 0), match('B', w, 2, 0));
  }
  data.push(match('T1', 'T2', 1, 1));
  data.push(match('T1', 'A', 2, 0), match('T2', 'A', 2, 0));
  data.push(match('T1', 'B', 1, 0), match('T2', 'B', 1, 0));

  it('aceleasi goluri date, adversari diferiti => rating de atac diferit (P vs slabi, Q vs puternici)', () => {
    const d: NormalizedMatch[] = [];
    // F1, F2 dau 4 goluri echipelor slabe (W) si doar 1 echipelor cu aparare buna (S)
    for (const f of ['F1', 'F2']) {
      for (const w of ['W1', 'W2']) d.push(match(f, w, 4, 0));
      for (const st of ['S1', 'S2']) d.push(match(f, st, 1, 0));
    }
    // P si Q dau amandoi 3 goluri pe meci (media bruta identica), P vs slabi, Q vs aparari bune
    d.push(match('P', 'W1', 3, 0), match('P', 'W2', 3, 0));
    d.push(match('Q', 'S1', 3, 0), match('Q', 'S2', 3, 0));
    const r = computeTeamRatings(d, asOf, { priorMatches: 0, goalDifferenceCap: 99, halfLifeMatches: 1e9 });
    expect(r.ratings.get('W1')!.defense).toBeGreaterThan(r.ratings.get('S1')!.defense);
    expect(r.ratings.get('Q')!.attack).toBeGreaterThan(r.ratings.get('P')!.attack);
  });

  it('A are lambda mult mai mica contra echipei de top decat contra uneia slabe', () => {
    const r = computeTeamRatings(data, asOf, { priorMatches: 0, goalDifferenceCap: 99 });
    const vsTop = expectedGoalsFromRatings(r, 'A', 'T1').lambdaA!;
    const vsWeak = expectedGoalsFromRatings(r, 'A', 'W1').lambdaA!;
    expect(vsTop).toBeLessThan(vsWeak);
    expect(vsTop).toBeLessThan(3.0); // media bruta a lui A (3 goluri/meci) nu se repeta contra topului
  });

  it('echipele slabe au aparare slaba (>1), cele de top aparare buna (<1)', () => {
    const r = computeTeamRatings(data, asOf);
    expect(r.ratings.get('W1')!.defense).toBeGreaterThan(1);
    expect(r.ratings.get('T1')!.defense).toBeLessThan(1);
    expect(r.ratings.get('T1')!.attack).toBeGreaterThan(r.ratings.get('W1')!.attack);
  });
});

describe('computeTeamRatings — recenta, shrinkage, plafon, competitii', () => {
  it('recenta: meciurile vechi cu multe goluri conteaza mai putin cand halfLife e mic', () => {
    const data: NormalizedMatch[] = [];
    for (let i = 0; i < 4; i++) data.push(match('Y', 'Z', 1, 1), match('X', 'Z', 1, 1)); // legatura intre echipe
    for (let i = 0; i < 3; i++) data.push(match('X', 'Y', 4, 1)); // vechi: X da multe goluri
    for (let i = 0; i < 3; i++) data.push(match('X', 'Y', 0, 1)); // recente: X nu mai marcheaza
    const fast = computeTeamRatings(data, asOf, { halfLifeMatches: 2, priorMatches: 0, goalDifferenceCap: 99 });
    const flat = computeTeamRatings(data, asOf, { halfLifeMatches: 1e9, priorMatches: 0, goalDifferenceCap: 99 });
    expect(fast.ratings.get('X')!.attack).toBeLessThan(flat.ratings.get('X')!.attack);
  });

  it('shrinkage: un singur meci 5-0 trage ratingul mai aproape de 1 decat zece meciuri 5-0', () => {
    const one = computeTeamRatings([match('P', 'Q', 5, 0)], asOf);
    const ten: NormalizedMatch[] = [];
    for (let i = 0; i < 10; i++) ten.push(match('P', 'Q', 5, 0));
    const many = computeTeamRatings(ten, asOf);
    const devOne = Math.abs(one.ratings.get('P')!.attack - 1);
    const devMany = Math.abs(many.ratings.get('P')!.attack - 1);
    expect(devOne).toBeLessThan(devMany);
  });

  it('plafon de golaveraj: 9-0 se comporta ca 5-0 cand cap = 5', () => {
    const big = computeTeamRatings([match('P', 'Q', 9, 0), match('Q', 'R', 1, 1)], asOf, { goalDifferenceCap: 5 });
    const five = computeTeamRatings([match('P', 'Q', 5, 0), match('Q', 'R', 1, 1)], asOf, { goalDifferenceCap: 5 });
    expect(big.ratings.get('P')!.attack).toBeCloseTo(five.ratings.get('P')!.attack, 10);
    expect(big.ratings.get('Q')!.defense).toBeCloseTo(five.ratings.get('Q')!.defense, 10);
  });

  it('pondere pe competitie: otherCompetitionWeight = 0 => ca si cum meciul din alta competitie nu exista', () => {
    const older = match('X', 'Y', 4, 0, { competitionId: 'c2' }); // mai vechi
    const target = match('X', 'Y', 1, 1, { competitionId: 'c1' });
    const withOther = computeTeamRatings([older, target], asOf, { competitionId: 'c1', otherCompetitionWeight: 0 });
    const only = computeTeamRatings([target], asOf, { competitionId: 'c1', otherCompetitionWeight: 0 });
    expect(withOther.ratings.get('X')!.attack).toBeCloseTo(only.ratings.get('X')!.attack, 10);
    expect(withOther.ratings.get('Y')!.defense).toBeCloseTo(only.ratings.get('Y')!.defense, 10);
  });

  it('baza lambda: media competitiei daca exista, altfel media globala', () => {
    const data = [match('A', 'B', 3, 1, { competitionId: 'c1' }), match('A', 'B', 1, 1, { competitionId: 'c2' })];
    const rc = computeTeamRatings(data, asOf, { competitionId: 'c1' });
    expect(rc.competitionGoals).toBeCloseTo(2, 10); // (3+1)/2
    expect(expectedGoalsFromRatings(rc, 'A', 'B').baselineSource).toBe('competition');
    const rg = computeTeamRatings(data, asOf, { competitionId: 'c3' });
    expect(rg.competitionGoals).toBeNull();
    expect(expectedGoalsFromRatings(rg, 'A', 'B').baselineSource).toBe('global');
  });

  it('echipa necunoscuta => lambda null', () => {
    const r = computeTeamRatings([match('A', 'B', 2, 1)], asOf);
    expect(expectedGoalsFromRatings(r, 'A', 'Z').lambdaA).toBeNull();
    expect(expectedGoalsFromRatings(r, 'Z', 'A').lambdaB).toBeNull();
  });

  it('deterministic: aceeasi intrare, aceeasi iesire, indiferent de ordinea listei', () => {
    const data = [match('A', 'B', 2, 1), match('B', 'C', 0, 3), match('C', 'A', 1, 1), match('A', 'C', 4, 0)];
    const r1 = computeTeamRatings(data, asOf);
    const r2 = computeTeamRatings([...data].reverse(), asOf);
    for (const t of ['A', 'B', 'C']) {
      expect(r1.ratings.get(t)!.attack).toBeCloseTo(r2.ratings.get(t)!.attack, 12);
      expect(r1.ratings.get(t)!.defense).toBeCloseTo(r2.ratings.get(t)!.defense, 12);
    }
  });
});
