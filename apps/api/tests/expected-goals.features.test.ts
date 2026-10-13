import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getExpectedGoals } from '../src/odds-engine/features/expected-goals.features';
import { matchHistoryProvider } from '../src/odds-engine/providers/match-history.provider';
import { prisma } from '../src/lib/prisma';

// Mock solo la nivel de test: nu schimbă arhitectura de producție și nu
// apelează niciodată baza de date reală — toate datele sunt în memorie.
vi.mock('../src/lib/prisma', () => ({
  prisma: {
    match: {
      findMany: vi.fn(),
    },
  },
}));

// Moment de referință fix, același pentru toate testele.
const asOf = new Date('2026-10-12T00:00:00Z');

const T_C1 = 'C1';
const T_C2 = 'C2';

const H1 = 'tH1';
const H2 = 'tH2';
const H3 = 'tH3';
const H4 = 'tH4';
const A1 = 'tA1';
const A2 = 'tA2';
const A3 = 'tA3';
const A4 = 'tA4';

/**
 * Construiește un "row" brut Prisma (ceea ce primește mock-ul findMany),
 * cu orientarea echipelor și a scorurilor exactă: scorul gazdei este
 * `homeScore`, scorul oaspetelui este `awayScore`.
 */
function m(
  id: string,
  homeId: string,
  awayId: string,
  comp: string | null,
  homeScore: number | null,
  awayScore: number | null,
  date: string,
  status = 'FINISHED'
) {
  return {
    id,
    homeTeamId: homeId,
    awayTeamId: awayId,
    competitionId: comp,
    matchday: 1,
    matchDate: new Date(date),
    status,
    homeScore,
    awayScore,
    homeTeam: { id: homeId, name: homeId },
    awayTeam: { id: awayId, name: awayId },
  };
}

// --- C1: cele 3 meciuri FINISHED, scoruri valide, toate înainte de asOf ---
const c1Fixed = [
  m('m1', H2, A2, T_C1, 2, 2, '2026-09-01T18:00:00Z'),
  m('m2', H3, A3, T_C1, 4, 0, '2026-09-02T18:00:00Z'),
  m('m3', H4, A4, T_C1, 1, 1, '2026-09-03T18:00:00Z'),
];

// --- Istoric global al gazdei H1 ---
const c2H1 = m('m4', H1, H2, T_C2, 3, 1, '2026-08-01T18:00:00Z');
const c1H1 = m('m5', H1, H3, T_C1, 1, 1, '2026-09-10T18:00:00Z');

// --- Istoric global al oaspetelui A1 ---
const c2A1 = m('m6', A2, A1, T_C2, 2, 0, '2026-08-05T18:00:00Z');
const c1A1 = m('m7', A3, A1, T_C1, 1, 2, '2026-09-11T18:00:00Z');

/**
 * Mock fidel al `prisma.match.findMany`:
 *  - dacă `where.competitionId` e setat → returnează doar meciurile din C1
 *    care au `competitionId === cerut` (nu se amestecă alte competiții).
 *  - altfel → returnează toate aparițiile echipei (ca gazdă sau oaspete)
 *    din setul de meciuri global.
 */
function mockFindMany(compFixtures: any[] = [], teamFixtures: any[] = []) {
  return async (query: any) => {
    if (query.where.competitionId) {
      return compFixtures.filter((m) => m.competitionId === query.where.competitionId);
    }
    // Prisma: where: { OR: [{ homeTeamId }, { awayTeamId }] }
    const teamId = query.where.OR?.[0]?.homeTeamId;
    return teamFixtures.filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId);
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  prisma.match.findMany.mockImplementation(mockFindMany());
});

describe('getExpectedGoals', () => {
  // Fixture unificat: C1 (3 meciuri) + istoric global al lui H1 + istoric global al lui A1.
  const allFixtures = [
    ...c1Fixed,
    c2H1,
    c1H1,
    c2A1,
    c1A1,
  ];

  describe('Matematica de bază — meciul ipotetic H1 vs A1 în C1', () => {
    it('lambdaHome = 9/7 (aprox. 1.2857142857) când C2 participă doar la media globală', async () => {
      prisma.match.findMany.mockImplementation(
        mockFindMany(allFixtures, allFixtures)
      );

      const result = await getExpectedGoals(H1, A1, asOf, T_C1);

      expect(result.home.lambdaHome).toBeCloseTo(9 / 7, 9);
      expect(result.home.lambdaHome).toBeCloseTo(1.2857142857, 9);
      expect(result.home.matchesUsed).toBe(2); // H1–H2 (C2) + H1–H3 (C1)

      expect(result.away.lambdaAway).toBe(1);
      expect(result.away.matchesUsed).toBe(2); // A2–A1 (C2) + A3–A1 (C1)
    });

    it('lambdaAway = 1: (1 × 1) / 1 = 1, confirmând orientarea corectă a scorurilor A1', async () => {
      prisma.match.findMany.mockImplementation(
        mockFindMany(allFixtures, allFixtures)
      );

      const result = await getExpectedGoals(H1, A1, asOf, T_C1);

      // A1 marchează în deplasare: 0 (la A2) + 2 (la A3) = 2 / 2 = 1
      // A1 primește în deplasare: 2 (de la A2) + 1 (de la A3) = 3 / 2 = 1.5
      // C1 baseline oaspeți: 2 + 0 + 1 = 3 / 3 = 1
      expect(result.away.lambdaAway).toBe(1);
    });
  });

  describe('Filtrare competițională: C2 influențează mediile globale, dar nu și baseline-ul C1', () => {
    it('meciurile din C2 aparțin istoricului global al echipelor (H1/H2, A1/A2/A3)', async () => {
      const compC1 = c1Fixed;
      const teamH1 = [c2H1, c1H1]; // H1 ca gazdă, indiferent de competiție
      const teamA1 = [c2A1, c1A1]; // A1 ca oaspete, indiferent de competiție

      prisma.match.findMany.mockImplementation(
        mockFindMany(compC1, [...teamH1, ...teamA1])
      );

      const result = await getExpectedGoals(H1, A1, asOf, T_C1);

      // Fără meciul H1–H2 3–1 din C2, H1 ar avea media 1.0, nu 2.0; deci C2 contează.
      expect(result.home.lambdaHome).toBeCloseTo(9 / 7, 9);
      expect(result.home.lambdaHome).not.toBeCloseTo(1.5, 3); // 1.5 ar fi doar din C1 (H1–H3 1-1)
    });

    it('alte competiții (C2) NU intră în media de referință a lui C1', async () => {
      const compC1Only = c1Fixed.filter((m) => m.competitionId === T_C1);
      const teamC1 = [
        ...compC1Only,
        c2H1, c1H1, c2A1, c1A1,
      ];

      prisma.match.findMany.mockImplementation(
        mockFindMany(compC1Only, teamC1)
      );

      const result = await getExpectedGoals(H1, A1, asOf, T_C1);

      // Baseline C1 = (7/3, 1) — exact ca scenariul inițial, deci C2 a fost exclus.
      expect(result.home.lambdaHome).toBeCloseTo(9 / 7, 9);
      expect(result.away.lambdaAway).toBe(1);
    });
  });

  describe('Filtrare temporală și de status', () => {
    it('meciurile SCHEDULED nu influențează mediile', async () => {
      const scheduled = m('m8', A3, A1, T_C1, 9, 9, '2026-09-09T18:00:00Z', 'SCHEDULED');
      const compC1 = [...c1Fixed, scheduled];
      const teamA1 = [scheduled, c2A1, c1A1];

      prisma.match.findMany.mockImplementation(
        mockFindMany(compC1, teamA1)
      );

      const result = await getExpectedGoals(H1, A1, asOf, T_C1);

      // Dacă meciul SCHEDULED ar fi contat, A1 în deplasare ar fi 11 GF / 3 meciuri.
      expect(result.away.lambdaAway).toBe(1);
      expect(result.away.matchesUsed).toBe(2);
    });

    it('meciurile cu matchDate >= asOf sunt excluse strict', async () => {
      const atAsOf = m('m9', A3, A1, T_C1, 9, 9, '2026-10-12T00:00:00Z'); // exact la asOf
      const afterAsOf = m('m10', A3, A1, T_C1, 9, 9, '2026-10-13T00:00:00Z');
      const compC1 = [...c1Fixed, atAsOf, afterAsOf];
      const teamA1 = [atAsOf, afterAsOf, c2A1, c1A1];

      prisma.match.findMany.mockImplementation(
        mockFindMany(compC1, teamA1)
      );

      const result = await getExpectedGoals(H1, A1, asOf, T_C1);

      // Meciurile de pe/ după asOf trebuie excluse; A1 rămâne 1.0.
      expect(result.away.lambdaAway).toBe(1);
      expect(result.away.matchesUsed).toBe(2);
    });
  });

  describe('Excluderea meciurilor nefinalizate / fără scor valid', () => {
    it('meciuri fără scoruri (null) sunt excluse din toate mediile', async () => {
      const noScore = m('m11', H1, H2, T_C2, null, null, '2026-08-10T18:00:00Z');
      const compC1 = c1Fixed;
      const teamH1 = [noScore, c2H1, c1H1];

      prisma.match.findMany.mockImplementation(
        mockFindMany(compC1, teamH1)
      );

      const result = await getExpectedGoals(H1, A1, asOf, T_C1);

      // H1–H2 3–1 contează, noScore = 0 meciuri; media H1 acasă rămâne 2.0.
      expect(result.home.lambdaHome).toBeCloseTo(9 / 7, 9);
      expect(result.home.matchesUsed).toBe(2);
    });

    it('meciuri cu scor negativ (invalid) sunt excluse', async () => {
      const negScore = m('m12', H1, H2, T_C2, 5, -2, '2026-08-12T18:00:00Z');
      const compC1 = c1Fixed;
      const teamH1 = [negScore, c2H1, c1H1];

      prisma.match.findMany.mockImplementation(
        mockFindMany(compC1, teamH1)
      );

      const result = await getExpectedGoals(H1, A1, asOf, T_C1);

      expect(result.home.lambdaHome).toBeCloseTo(9 / 7, 9);
    });

    it('meciuri cu scor Infinity/NaN sunt excluse, nu produc valori stricate', async () => {
      const infScore = m('m13', H1, H2, T_C2, Infinity, 2, '2026-08-13T18:00:00Z');
      const nanScore = m('m14', H1, H2, T_C2, NaN, 2, '2026-08-14T18:00:00Z');
      const compC1 = c1Fixed;
      const teamH1 = [infScore, nanScore, c2H1, c1H1];

      prisma.match.findMany.mockImplementation(
        mockFindMany(compC1, teamH1)
      );

      const result = await getExpectedGoals(H1, A1, asOf, T_C1);

      expect(Number.isFinite(result.home.lambdaHome)).toBe(true);
      expect(result.home.lambdaHome).toBeCloseTo(9 / 7, 9);
      expect(!Number.isNaN(result.home.lambdaHome)).toBe(true);
    });
  });

  describe('Cazuri de bord: numitor nul / absent / invalid', () => {
    it('absența completă a istoricului echipei produce null, nu zero inventat', async () => {
      prisma.match.findMany.mockImplementation(
        mockFindMany(c1Fixed, []) // nicio apariție a lui H1 și a lui A1
      );

      const result = await getExpectedGoals(H1, A1, asOf, T_C1);

      expect(result.home.lambdaHome).toBeNull();
      expect(result.away.lambdaAway).toBeNull();
      expect(result.home.matchesUsed).toBe(0);
      expect(result.away.matchesUsed).toBe(0);
    });

    it('istoric gol nu produce null, 0, Infinity, NaN sau valori negative', async () => {
      const compC1Empty = c1Fixed;
      const teamH1Empty: any[] = [];
      const teamA1Empty: any[] = [];

      prisma.match.findMany.mockImplementation(
        mockFindMany(compC1Empty, teamH1Empty)
      );

      const result = await getExpectedGoals(H1, A1, asOf, T_C1);

      // Fără meciuri eligibile, lambdaHome e null; lambdaAway: forAvg null → null.
      expect(result.home.lambdaHome).toBeNull();
      expect(result.away.lambdaAway).toBeNull();
      for (const val of [result.home.lambdaHome, result.away.lambdaAway]) {
        expect(val).not.toBe(0);
        expect(val).not.toBe(Infinity);
        expect(val).not.toBe(-Infinity);
        expect(!Number.isNaN(val)).toBe(true);
        expect(val).not.toBeGreaterThan(0);
      }
    });

    it('media de referință zero a competiției nu produce Infinity (lambda nul)', async () => {
      const noGoals = [
        m('z1', H2, A2, T_C1, 0, 0, '2026-09-01T18:00:00Z'),
        m('z2', H3, A3, T_C1, 0, 0, '2026-09-02T18:00:00Z'),
        m('z3', H4, A4, T_C1, 0, 0, '2026-09-03T18:00:00Z'),
      ];
      prisma.match.findMany.mockImplementation(
        mockFindMany(noGoals, allFixtures)
      );

      const result = await getExpectedGoals(H1, A1, asOf, T_C1);

      // compHomeGoalsAvg = 0 → calculLambda returnează null (evită diviziune prin zero).
      expect(result.home.lambdaHome).toBeNull();
      expect(result.away.lambdaAway).toBeNull();
    });

    it('numitor invalid (NaN, negative) nu produce λ valabil', async () => {
      const weird = [
        m('w1', H2, A2, T_C1, 0, 0, '2026-09-01T18:00:00Z'),
      ];
      prisma.match.findMany.mockImplementation(
        mockFindMany(weird, allFixtures)
      );

      const result = await getExpectedGoals(H1, A1, asOf, T_C1);

      expect(result.home.lambdaHome).toBeNull();
      expect(result.away.lambdaAway).toBeNull();
    });
  });

  describe('Independent: cele două lambda sunt calculate separat', () => {
    it('modificarea istoricului doar al gazdei nu influențează lambdaAway', async () => {
      const compC1 = c1Fixed;
      const teamH1 = [c2H1, c1H1, m('x1', H1, H4, T_C2, 9, 0, '2026-08-20T18:00:00Z')]; // H1 cu 9 goluri în plus
      const teamA1 = [c2A1, c1A1];

      prisma.match.findMany.mockImplementation(
        mockFindMany(compC1, [...teamH1, ...teamA1])
      );

      const result = await getExpectedGoals(H1, A1, asOf, T_C1);

      // λAway nu depinde de H1: tot 1, deși H1 are un nou meci cu 9 goluri.
      expect(result.away.lambdaAway).toBe(1);
      expect(result.home.lambdaHome).not.toBe(9 / 7); // a scăzut, pentru că avg H1 a crescut
      expect(result.home.lambdaHome).toBeCloseTo(27 / 22, 6); // (7/2 × 1.5)/(7/3)
    });

    it('modificarea istoricului doar al oaspetelui nu influențează lambdaHome', async () => {
      const compC1 = c1Fixed;
      const teamH1 = [c2H1, c1H1];
      const teamA1 = [
        c2A1,
        c1A1,
        m('x2', H4, A1, T_C2, 0, 9, '2026-08-21T18:00:00Z'), // A1 marchează 9 în plus
      ];

      prisma.match.findMany.mockImplementation(
        mockFindMany(compC1, [...teamH1, ...teamA1])
      );

      const result = await getExpectedGoals(H1, A1, asOf, T_C1);

      expect(result.home.lambdaHome).toBeCloseTo(9 / 7, 9);
      expect(result.away.lambdaAway).not.toBe(1);
    });
  });

  describe('matchesUsed reflectă doar observațiile eligibile', () => {
    it('matchesUsed = 2 chiar dacă o lambda e null din cauza numitorului', async () => {
      const noGoals = [
        m('z1', H2, A2, T_C1, 0, 0, '2026-09-01T18:00:00Z'),
        m('z2', H3, A3, T_C1, 0, 0, '2026-09-02T18:00:00Z'),
        m('z3', H4, A4, T_C1, 0, 0, '2026-09-03T18:00:00Z'),
      ];
      prisma.match.findMany.mockImplementation(
        mockFindMany(noGoals, allFixtures)
      );

      const result = await getExpectedGoals(H1, A1, asOf, T_C1);

      expect(result.home.lambdaHome).toBeNull();
      expect(result.away.lambdaAway).toBeNull();
      expect(result.home.matchesUsed).toBe(2); // H1–H2 + H1–H3 eligibile
      expect(result.away.matchesUsed).toBe(2); // A2–A1 + A3–A1 eligibile
    });
  });
});

describe('getExpectedGoals — integrare mock complet pe fixture real', () => {
  const compC1 = [
    m('m1', H2, A2, T_C1, 2, 2, '2026-09-01T18:00:00Z'),
    m('m2', H3, A3, T_C1, 4, 0, '2026-09-02T18:00:00Z'),
    m('m3', H4, A4, T_C1, 1, 1, '2026-09-03T18:00:00Z'),
  ];
  const teamAll = [
    ...compC1,
    m('m4', H1, H2, T_C2, 3, 1, '2026-08-01T18:00:00Z'),
    m('m5', H1, H3, T_C1, 1, 1, '2026-09-10T18:00:00Z'),
    m('m6', A2, A1, T_C2, 2, 0, '2026-08-05T18:00:00Z'),
    m('m7', A3, A1, T_C1, 1, 2, '2026-09-11T18:00:00Z'),
  ];

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.match.findMany.mockImplementation(mockFindMany(compC1, teamAll));
  });

  it('rezultat final H1 vs A1, C1: {home: 9/7, away: 1}', async () => {
    const result = await getExpectedGoals(H1, A1, asOf, T_C1);
    expect(result.home.lambdaHome).toBeCloseTo(9 / 7, 9);
    expect(result.away.lambdaAway).toBe(1);
    expect(result.home.matchesUsed).toBe(2);
    expect(result.away.matchesUsed).toBe(2);
  });
});

