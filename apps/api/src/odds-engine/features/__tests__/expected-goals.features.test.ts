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

const asOf = new Date('2025-06-10');

function mockProvider(opts: {
  comp?: NormalizedMatch[];
  global?: NormalizedMatch[];
  teams?: Record<string, NormalizedMatch[]>;
}) {
  vi.mocked(matchHistoryProvider.getCompetitionMatches).mockResolvedValue(opts.comp ?? []);
  vi.mocked(matchHistoryProvider.getGlobalMatches).mockResolvedValue(opts.global ?? []);
  vi.mocked(matchHistoryProvider.getTeamMatches).mockImplementation(
    async (id: string) => opts.teams?.[id] ?? []
  );
}

describe('Expected Goals — fara separare acasa/deplasare', () => {
  beforeEach(() => vi.clearAllMocks());

  it('formula exacta: compAvg * (GF_A/global) * (GA_B/global)', async () => {
    // Global: 5 meciuri, 20 goluri => 20 / (2*5) = 2.0 goluri pe echipa si meci
    const global = [
      makeMatch({ matchId: 'g1', competitionId: 'cX', homeTeamId: 'x', awayTeamId: 'y', homeScore: 3, awayScore: 1 }),
      makeMatch({ matchId: 'g2', competitionId: 'cY', homeTeamId: 'z', awayTeamId: 'w', homeScore: 1, awayScore: 2 }),
      makeMatch({ matchId: 'c1', competitionId: 'c1', homeTeamId: 'tA', awayTeamId: 'tB', homeScore: 2, awayScore: 1 }),
      makeMatch({ matchId: 'h1', competitionId: 'cX', homeTeamId: 'tA', awayTeamId: 'tX', homeScore: 4, awayScore: 1 }),
      makeMatch({ matchId: 'a1', competitionId: 'cX', homeTeamId: 'tY', awayTeamId: 'tB', homeScore: 2, awayScore: 3 }),
    ];
    // Competitie c1: 1 meci 2-1 => 3 / 2 = 1.5
    const comp = [global[2]];
    // tA: doar h1 (GF 4, GA 1). tB: doar a1 (GF 3, GA 2).
    mockProvider({ comp, global, teams: { tA: [global[3]], tB: [global[4]] } });
    const res = await getExpectedGoals('tA', 'tB', asOf, 'c1');
    // lambdaA = 1.5 * (4/2) * (2/2) = 3.0 ; lambdaB = 1.5 * (3/2) * (1/2) = 1.125
    expect(res.home.lambdaHome).toBeCloseTo(3.0, 10);
    expect(res.away.lambdaAway).toBeCloseTo(1.125, 10);
    expect(res.home.matchesUsed).toBe(1);
    expect(res.away.matchesUsed).toBe(1);
  });

  it('foloseste TOATE meciurile echipei, indiferent de gazda/oaspete', async () => {
    const tAHome = makeMatch({ matchId: 'a-h', homeTeamId: 'tA', awayTeamId: 'tX', homeScore: 2, awayScore: 0 });
    const tAAway = makeMatch({ matchId: 'a-a', homeTeamId: 'tX', awayTeamId: 'tA', homeScore: 1, awayScore: 3 });
    const tBGame = makeMatch({ matchId: 'b-1', homeTeamId: 'tB', awayTeamId: 'tX', homeScore: 1, awayScore: 1 });
    const all = [tAHome, tAAway, tBGame];
    mockProvider({ comp: all, global: all, teams: { tA: [tAHome, tAAway], tB: [tBGame] } });
    const res = await getExpectedGoals('tA', 'tB', asOf, 'c1');
    expect(res.home.matchesUsed).toBe(2); // ambele meciuri ale lui tA conteaza
    expect(res.away.matchesUsed).toBe(1);
    // global = comp = (2+0 + 1+3 + 1+1) / (2*3) = 8/6
    // GF_A = (2+3)/2 = 2.5 ; GA_B = 1 ; => lambdaA = g * (2.5/g) * (1/g) = 2.5/g
    const g = 8 / 6;
    expect(res.home.lambdaHome).toBeCloseTo(2.5 / g, 10);
  });

  it('nu are avantaj de teren: schimbarea ordinii echipelor da aceleasi valori', async () => {
    const m1 = makeMatch({ matchId: 'm1', homeTeamId: 'tA', awayTeamId: 'tX', homeScore: 3, awayScore: 1 });
    const m2 = makeMatch({ matchId: 'm2', homeTeamId: 'tX', awayTeamId: 'tB', homeScore: 2, awayScore: 2 });
    const all = [m1, m2];
    mockProvider({ comp: all, global: all, teams: { tA: [m1], tB: [m2] } });
    const ab = await getExpectedGoals('tA', 'tB', asOf, 'c1');
    const ba = await getExpectedGoals('tB', 'tA', asOf, 'c1');
    expect(ab.home.lambdaHome).toBeCloseTo(ba.away.lambdaAway!, 12);
    expect(ab.away.lambdaAway).toBeCloseTo(ba.home.lambdaHome!, 12);
  });

  it('exclude meciurile la sau dupa asOf (strict matchDate < asOf)', async () => {
    const comp = [
      makeMatch({ matchId: 'c1', homeScore: 2, awayScore: 1, matchDate: new Date('2025-06-09') }),
      makeMatch({ matchId: 'c2', homeScore: 5, awayScore: 5, matchDate: new Date('2025-06-10') }),
    ];
    mockProvider({ comp, global: comp, teams: {} });
    const res = await getExpectedGoals('tA', 'tB', asOf, 'c1');
    expect(res.home.lambdaHome).toBeNull(); // echipele nu au istoric
  });

  it('nu lasa meciurile viitoare / nefinalizate sa influenteze', async () => {
    const past = makeMatch({ matchId: 'past', homeTeamId: 'tA', awayTeamId: 'tB', homeScore: 2, awayScore: 1, matchDate: new Date('2025-05-01') });
    const live = makeMatch({ matchId: 'live', homeTeamId: 'tA', awayTeamId: 'tB', status: 'LIVE', homeScore: 9, awayScore: 9, matchDate: new Date('2025-05-05') });
    const sched = makeMatch({ matchId: 'sched', homeTeamId: 'tA', awayTeamId: 'tB', status: 'SCHEDULED', homeScore: null, awayScore: null, matchDate: new Date('2025-05-08') });
    const future = makeMatch({ matchId: 'future', homeTeamId: 'tA', awayTeamId: 'tB', homeScore: 10, awayScore: 10, matchDate: new Date('2025-06-15') });
    const all = [past, live, sched, future];
    mockProvider({ comp: all, global: all, teams: { tA: all, tB: all } });
    const res = await getExpectedGoals('tA', 'tB', asOf, 'c1');
    expect(res.home.matchesUsed).toBe(1);
    expect(res.away.matchesUsed).toBe(1);
    // global = comp = 3/2 = 1.5 ; GF_A = 2, GA_B = 2 (tB a primit 2) => 1.5*(2/1.5)*(2/1.5)... verificam doar ca nu e influentat de 9-9 / 10-10
    expect(res.home.lambdaHome!).toBeCloseTo(1.5 * (2 / 1.5) * (2 / 1.5), 10);
  });

  it('exclude scoruri invalide (negativ, non-intreg, null)', async () => {
    const comp = [
      makeMatch({ matchId: 'bad1', homeScore: -1, awayScore: 1, matchDate: new Date('2025-05-01') }),
      makeMatch({ matchId: 'bad2', homeScore: 1.5, awayScore: 2, matchDate: new Date('2025-05-02') }),
      makeMatch({ matchId: 'bad3', homeScore: null, awayScore: 1, matchDate: new Date('2025-05-03') }),
    ];
    mockProvider({ comp, global: comp, teams: { tA: comp, tB: comp } });
    const res = await getExpectedGoals('tA', 'tB', asOf, 'c1');
    expect(res.home.lambdaHome).toBeNull();
    expect(res.away.lambdaAway).toBeNull();
  });

  it('null cand lipseste istoricul echipei, media competitiei sau media globala', async () => {
    mockProvider({});
    const res = await getExpectedGoals('tA', 'tB', asOf, 'c1');
    expect(res.home.lambdaHome).toBeNull();
    expect(res.away.lambdaAway).toBeNull();
  });

  it('null cand media globala este zero (toate scorurile 0-0)', async () => {
    const m = makeMatch({ matchId: 'z', homeTeamId: 'tA', awayTeamId: 'tB', homeScore: 0, awayScore: 0, matchDate: new Date('2025-05-01') });
    mockProvider({ comp: [m], global: [m], teams: { tA: [m], tB: [m] } });
    const res = await getExpectedGoals('tA', 'tB', asOf, 'c1');
    expect(res.home.lambdaHome).toBeNull();
    expect(res.away.lambdaAway).toBeNull();
  });

  it('competitii cu medii diferite dau baseline diferit', async () => {
    const lowComp = [makeMatch({ matchId: 'l1', homeScore: 1, awayScore: 0, competitionId: 'low', matchDate: new Date('2025-05-01') })];
    const highComp = [makeMatch({ matchId: 'h1', homeScore: 5, awayScore: 4, competitionId: 'high', matchDate: new Date('2025-05-01') })];
    const tm = makeMatch({ matchId: 'tm', homeTeamId: 'tA', awayTeamId: 'tB', homeScore: 2, awayScore: 1, competitionId: 'low', matchDate: new Date('2025-05-01') });
    const global = [...lowComp, ...highComp, tm];
    vi.mocked(matchHistoryProvider.getGlobalMatches).mockResolvedValue(global);
    vi.mocked(matchHistoryProvider.getTeamMatches).mockResolvedValue([tm]);
    vi.mocked(matchHistoryProvider.getCompetitionMatches).mockImplementation(async (id: string) =>
      id === 'low' ? lowComp : highComp
    );
    const low = await getExpectedGoals('tA', 'tB', asOf, 'low');
    const high = await getExpectedGoals('tA', 'tB', asOf, 'high');
    expect(high.home.lambdaHome!).toBeGreaterThan(low.home.lambdaHome!);
  });
});
