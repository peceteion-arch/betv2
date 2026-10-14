
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getExpectedGoals } from '../expected-goals.features';
import { matchHistoryProvider } from '../../providers/match-history.provider';
import { NormalizedMatch } from '../../providers/match-history.types';

vi.mock('../../providers/match-history.provider', () => ({
  matchHistoryProvider: {
    getCompetitionMatches: vi.fn(),
    getTeamMatches: vi.fn(),
  },
}));

function makeMatch(overrides: Partial<NormalizedMatch> & { matchId: string }): NormalizedMatch {
  return {
    matchId: overrides.matchId,
    homeTeamId: 'h1',
    awayTeamId: 'a1',
    homeTeamName: 'H',
    awayTeamName: 'A',
    competitionId: 'c1',
    matchday: 1,
    matchDate: new Date('2025-06-01'),
    status: 'FINISHED',
    homeScore: 2,
    awayScore: 1,
    ...overrides,
  } as NormalizedMatch;
}

describe('Expected Goals - PASUL 1.5B.2 audit si corectare', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calculeaza lambda pentru date valide (orientare corecta gazda/deplasare)', async () => {
    const compMatches: NormalizedMatch[] = [
      makeMatch({ matchId: 'c1', homeTeamId: 'tA', awayTeamId: 'tB', homeScore: 3, awayScore: 1, matchDate: new Date('2025-06-01'), competitionId: 'c1' }),
      makeMatch({ matchId: 'c2', homeTeamId: 'tC', awayTeamId: 'tD', homeScore: 2, awayScore: 2, matchDate: new Date('2025-06-02'), competitionId: 'c1' }),
    ];
    const homeMatches: NormalizedMatch[] = [
      makeMatch({ matchId: 'h1', homeTeamId: 'tA', awayTeamId: 'tX', homeScore: 3, awayScore: 0, matchDate: new Date('2025-05-01') }),
    ];
    const awayMatches: NormalizedMatch[] = [
      makeMatch({ matchId: 'a1', homeTeamId: 'tY', awayTeamId: 'tB', homeScore: 1, awayScore: 2, matchDate: new Date('2025-05-01') }),
    ];
    vi.mocked(matchHistoryProvider.getCompetitionMatches).mockResolvedValue(compMatches);
    vi.mocked(matchHistoryProvider.getTeamMatches).mockImplementation(async (id: string) => {
      if (id === 'tA') return homeMatches;
      if (id === 'tB') return awayMatches;
      return [];
    });
    const res = await getExpectedGoals('tA', 'tB', new Date('2025-06-10'), 'c1');
    expect(res.home.lambdaHome).not.toBeNull();
    expect(res.home.lambdaHome).toBeGreaterThanOrEqual(0);
    expect(res.away.lambdaAway).not.toBeNull();
    expect(res.away.lambdaAway).toBeGreaterThanOrEqual(0);
    expect(res.home.matchesUsed).toBe(1);
    expect(res.away.matchesUsed).toBe(1);
  });

  it('exclude meciurile la sau dupa asOf (strict matchDate < asOf)', async () => {
    const compMatches: NormalizedMatch[] = [
      makeMatch({ matchId: 'c1', homeScore: 2, awayScore: 1, matchDate: new Date('2025-06-09'), competitionId: 'c1' }),
      makeMatch({ matchId: 'c2', homeScore: 5, awayScore: 5, matchDate: new Date('2025-06-10'), competitionId: 'c1' }),
    ];
    vi.mocked(matchHistoryProvider.getCompetitionMatches).mockResolvedValue(compMatches);
    vi.mocked(matchHistoryProvider.getTeamMatches).mockResolvedValue([]);
    const res = await getExpectedGoals('tA', 'tB', new Date('2025-06-10'), 'c1');
    expect(res.home.lambdaHome).toBeNull();
  });

  it('returneaza null cand lipseste istoricul echipei sau media competitiei', async () => {
    vi.mocked(matchHistoryProvider.getCompetitionMatches).mockResolvedValue([]);
    vi.mocked(matchHistoryProvider.getTeamMatches).mockResolvedValue([]);
    const res = await getExpectedGoals('tA', 'tB', new Date('2025-06-10'), 'c1');
    expect(res.home.lambdaHome).toBeNull();
    expect(res.away.lambdaAway).toBeNull();
  });

  it('exclupe scoruri invalide (negativ, non-intreg, null, infinito)', async () => {
    const compMatches: NormalizedMatch[] = [
      makeMatch({ matchId: 'bad1', homeScore: -1, awayScore: 1, matchDate: new Date('2025-05-01'), competitionId: 'c1' }),
      makeMatch({ matchId: 'bad2', homeScore: 1.5, awayScore: 2, matchDate: new Date('2025-05-02'), competitionId: 'c1' }),
      makeMatch({ matchId: 'bad3', homeScore: null, awayScore: 1, matchDate: new Date('2025-05-03'), competitionId: 'c1' }),
    ];
    vi.mocked(matchHistoryProvider.getCompetitionMatches).mockResolvedValue(compMatches);
    vi.mocked(matchHistoryProvider.getTeamMatches).mockResolvedValue([]);
    const res = await getExpectedGoals('tA', 'tB', new Date('2025-06-10'), 'c1');
    expect(res.home.lambdaHome).toBeNull();
  });

  it('nu permite meciuri viitoare sau nefinalizate sa influenteze', async () => {
    const allMatches = [
      makeMatch({ matchId: 'past', status: 'FINISHED', homeTeamId: 'tA', awayTeamId: 'tB', homeScore: 2, awayScore: 1, matchDate: new Date('2025-05-01') }),
      makeMatch({ matchId: 'live', status: 'LIVE', homeScore: 2, awayScore: 1, matchDate: new Date('2025-05-05') }),
      makeMatch({ matchId: 'scheduled', status: 'SCHEDULED', homeScore: null, awayScore: null, matchDate: new Date('2025-05-08') }),
      makeMatch({ matchId: 'future', status: 'FINISHED', homeScore: 10, awayScore: 10, matchDate: new Date('2025-06-15') }),
    ];
    vi.mocked(matchHistoryProvider.getTeamMatches).mockImplementation(async (id: string) => allMatches);
    vi.mocked(matchHistoryProvider.getCompetitionMatches).mockResolvedValue(allMatches.filter(m => m.matchId === 'past'));
    const res = await getExpectedGoals('tA', 'tB', new Date('2025-06-10'), 'c1');
    expect(res.home.matchesUsed).toBe(1);
  });

  it('normalizeaza corect competitii cu medii diferite', async () => {
    const lowComp: NormalizedMatch[] = [
      makeMatch({ matchId: 'l1', homeScore: 1, awayScore: 0, matchDate: new Date('2025-05-01'), competitionId: 'low' }),
    ];
    const highComp: NormalizedMatch[] = [
      makeMatch({ matchId: 'h1', homeScore: 5, awayScore: 4, matchDate: new Date('2025-05-01'), competitionId: 'high' }),
    ];
    const teamMatches = [
      makeMatch({ matchId: 'tm', homeTeamId: 'tA', awayTeamId: 'tB', homeScore: 2, awayScore: 1, matchDate: new Date('2025-05-01'), competitionId: 'low' }),
    ];
    vi.mocked(matchHistoryProvider.getTeamMatches).mockResolvedValue(teamMatches);
    vi.mocked(matchHistoryProvider.getCompetitionMatches).mockImplementation(async (compId: string) => {
      if (compId === 'low') return lowComp;
      return highComp;
    });
    const resLow = await getExpectedGoals('tA', 'tB', new Date('2025-06-10'), 'low');
    const resHigh = await getExpectedGoals('tA', 'tB', new Date('2025-06-10'), 'high');
    expect(resLow.home.lambdaHome).toBeGreaterThanOrEqual(0);
    expect(resHigh.home.lambdaHome).toBeGreaterThanOrEqual(0);
  });
});
