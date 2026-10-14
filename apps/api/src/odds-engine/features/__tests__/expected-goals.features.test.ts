
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getExpectedGoals } from '../expected-goals.features';
import { matchHistoryProvider } from '../../providers/match-history.provider';
import { NormalizedMatch } from '../../providers/match-history.types';

vi.mock('../../providers/match-history.provider', () => ({
  matchHistoryProvider: {
    getCompetitionMatches: vi.fn(),
    getGlobalMatches: vi.fn(),
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

describe('Expected Goals - PASUL 1.7 formula convenita', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calculeaza lambdaHome si lambdaAway cu formula exacta', async () => {
    // Global: 2 meciuri eligibile (toate competitiile, < asOf, FINISHED, scoruri valide)
    // M1: home=3, away=1 => globalHome=3, globalAway=1
    // M2: home=1, away=2 => globalHome=4, globalAway=3
    // globalHomeAvg = (3+1)/2 = 2; globalAwayAvg = (1+2)/2 = 1.5
    const globalMatches = [
      makeMatch({ matchId: 'g1', competitionId: 'cX', homeTeamId: 'x', awayTeamId: 'y', homeScore: 3, awayScore: 1, matchDate: new Date('2025-05-01'), status: 'FINISHED' }),
      makeMatch({ matchId: 'g2', competitionId: 'cY', homeTeamId: 'z', awayTeamId: 'w', homeScore: 1, awayScore: 2, matchDate: new Date('2025-05-02'), status: 'FINISHED' }),
    ];
    // Competitie: 1 meci eligibil, home=2, away=1 => compHome=2, compAway=1
    const compMatches = [
      makeMatch({ matchId: 'c1', competitionId: 'c1', homeTeamId: 'tA', awayTeamId: 'tB', homeScore: 2, awayScore: 1, matchDate: new Date('2025-05-03'), status: 'FINISHED' }),
    ];
    // Home team (tA) global home: 2 (c1) + 1 (g2 cast as home pentru tA?) -> pentru fixture simplu folosi homeMatches pentru tA doar cu meciuri ca gazda
    const homeMatches = [
      makeMatch({ matchId: 'h1', homeTeamId: 'tA', awayTeamId: 'tX', homeScore: 4, awayScore: 1, matchDate: new Date('2025-05-01'), status: 'FINISHED' }),
    ];
    const awayMatches = [
      makeMatch({ matchId: 'a1', homeTeamId: 'tY', awayTeamId: 'tB', homeScore: 2, awayScore: 3, matchDate: new Date('2025-05-01'), status: 'FINISHED' }),
    ];
    vi.mocked(matchHistoryProvider.getGlobalMatches).mockResolvedValue(globalMatches);
    vi.mocked(matchHistoryProvider.getCompetitionMatches).mockResolvedValue(compMatches);
    vi.mocked(matchHistoryProvider.getTeamMatches).mockImplementation(async (id: string) => {
      if (id === 'tA') return homeMatches;
      if (id === 'tB') return awayMatches;
      return [];
    });
    const res = await getExpectedGoals('tA', 'tB', new Date('2025-06-10'), 'c1');
    // hthGFAvg = 4; ataGAAvg = 2; compHomeGoalsAvg = 2; globalHomeGoalsAvg = 2
    // lambdaHome = 2 * (4/2) * (2/2) = 2 * 2 * 1 = 4
    expect(res.home.lambdaHome).toBeCloseTo(4, 10);
    // ataGFAvg = 3; hthGAAvg = 1; compAwayGoalsAvg = 1; globalAwayGoalsAvg = 1.5
    // lambdaAway = 1 * (3/1.5) * (1/1.5) = 1 * 2 * 0.666... = 1.333...
    expect(res.away.lambdaAway).toBeCloseTo(4 / 3, 10);
    expect(res.home.matchesUsed).toBe(1);
    expect(res.away.matchesUsed).toBe(1);
  });

  it('returneaza null cand global goals avg este zero sau lipseste', async () => {
    vi.mocked(matchHistoryProvider.getGlobalMatches).mockResolvedValue([]);
    vi.mocked(matchHistoryProvider.getCompetitionMatches).mockResolvedValue([makeMatch({ matchId: 'c1', competitionId: 'c1', homeTeamId: 'tA', awayTeamId: 'tB', homeScore: 2, awayScore: 1, matchDate: new Date('2025-05-01'), status: 'FINISHED' })]);
    vi.mocked(matchHistoryProvider.getTeamMatches).mockResolvedValue([]);
    const res = await getExpectedGoals('tA', 'tB', new Date('2025-06-10'), 'c1');
    expect(res.home.lambdaHome).toBeNull();
    expect(res.away.lambdaAway).toBeNull();
  });
});
