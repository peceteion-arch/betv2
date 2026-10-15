import { describe, it, expect } from 'vitest';
import { computeStandings } from './competition-standings.features';
import { NormalizedMatch } from '../providers/match-history.types';

let id = 0;
function match(home: string, away: string, hs: number | null, as: number | null, over: Partial<NormalizedMatch> = {}): NormalizedMatch {
  id += 1;
  return {
    matchId: `m${id}`, homeTeamId: home, awayTeamId: away,
    homeTeamName: home, awayTeamName: away,
    competitionId: 'c1', matchday: 1, matchDate: new Date('2026-09-01'),
    status: 'FINISHED', homeScore: hs, awayScore: as, ...over,
  };
}
const asOf = new Date('2026-10-01');

describe('computeStandings', () => {
  it('calculeaza puncte, goluri si ordine', () => {
    const t = computeStandings([match('A', 'B', 3, 0), match('B', 'C', 1, 1), match('C', 'A', 0, 2)], asOf);
    // A: 2 victorii (3-0, 2-0). B si C: 1 punct fiecare; C are golaveraj -2, B are -3.
    expect(t.map(r => r.teamId)).toEqual(['A', 'C', 'B']);
    expect(t[0]).toMatchObject({ teamId: 'A', played: 2, wins: 2, points: 6, goalsFor: 5, goalsAgainst: 0, goalDifference: 5, rank: 1 });
    expect(t[1]).toMatchObject({ teamId: 'C', points: 1, goalDifference: -2, rank: 2 });
    expect(t[2]).toMatchObject({ teamId: 'B', points: 1, goalDifference: -3, rank: 3 });
  });

  it('departajare: puncte egale -> golaveraj, apoi goluri marcate', () => {
    // X si Y: ambele 3 puncte; X are golaveraj mai bun
    const t1 = computeStandings([match('X', 'Z', 4, 0), match('Y', 'Z', 1, 0)], asOf);
    expect(t1.map(r => r.teamId)).toEqual(['X', 'Y', 'Z']);
    // golaveraj egal (+1), mai multe goluri marcate castiga
    const t2 = computeStandings([match('P', 'Z', 3, 2), match('Q', 'Z', 1, 0)], asOf);
    expect(t2[0].teamId).toBe('P');
    expect(t2[1].teamId).toBe('Q');
  });

  it('loc impartit cand puncte, golaveraj si goluri marcate sunt identice', () => {
    const t = computeStandings([match('A', 'Z', 1, 0), match('B', 'Z', 1, 0)], asOf);
    expect(t[0].rank).toBe(1);
    expect(t[1].rank).toBe(1);
    expect(t[2].rank).toBe(3);
  });

  it('ignora meciuri neeligibile (SCHEDULED, fara scor, in viitor / la asOf)', () => {
    const t = computeStandings([
      match('A', 'B', null, null, { status: 'SCHEDULED' }),
      match('A', 'B', 2, 1, { matchDate: new Date('2026-10-01') }),
      match('A', 'B', 2, 1, { matchDate: new Date('2026-11-01') }),
      match('A', 'B', 1, 0),
    ], asOf);
    expect(t.find(r => r.teamId === 'A')).toMatchObject({ played: 1, points: 3 });
  });

  it('lista goala -> clasament gol', () => {
    expect(computeStandings([], asOf)).toEqual([]);
  });
});
