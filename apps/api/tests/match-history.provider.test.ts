import { describe, it, expect, vi, beforeEach } from 'vitest';
import { matchHistoryProvider } from '../src/odds-engine/providers/match-history.provider';
import { prisma } from '../src/lib/prisma';

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    match: {
      findMany: vi.fn(),
    },
  },
}));

function matchRecord(overrides: Record<string, any> = {}) {
  return {
    id: 'm1',
    homeTeamId: 't1',
    awayTeamId: 't2',
    competitionId: 'c1',
    matchday: 1,
    matchDate: new Date('2026-09-01T18:00:00Z'),
    status: 'FINISHED',
    homeScore: 2,
    awayScore: 1,
    homeTeam: { id: 't1', name: 'Team A', logoUrl: null },
    awayTeam: { id: 't2', name: 'Team B', logoUrl: null },
    competition: { id: 'c1', name: 'Comp', logoUrl: null, active: true },
    ...overrides,
  };
}

describe('matchHistoryProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('Validation - asOf parameter', () => {
    const invalidValues = [
      { val: undefined, name: 'undefined' },
      { val: null, name: 'null' },
      { val: '2026-01-01', name: 'string' },
      { val: 123456789, name: 'number' },
      { val: new Date('invalid-date'), name: 'Invalid Date object' },
      { val: {}, name: 'empty object' },
    ];

    it.each(invalidValues)('getTeamMatches should reject $name', async ({ val }) => {
      await expect(matchHistoryProvider.getTeamMatches('t1', val as any)).rejects.toThrow(TypeError);
      await expect(matchHistoryProvider.getTeamMatches('t1', val as any)).rejects.toThrow('asOf must be a valid Date');
      expect(prisma.match.findMany).not.toHaveBeenCalled();
    });

    it.each(invalidValues)('getRecentTeamMatches should reject $name', async ({ val }) => {
      await expect(matchHistoryProvider.getRecentTeamMatches('t1', 5, val as any)).rejects.toThrow(TypeError);
      expect(prisma.match.findMany).not.toHaveBeenCalled();
    });

    it.each(invalidValues)('getHeadToHead should reject $name', async ({ val }) => {
      await expect(matchHistoryProvider.getHeadToHead('t1', 't2', val as any)).rejects.toThrow(TypeError);
      expect(prisma.match.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getTeamMatches', () => {
    it('finds both home and away matches', async () => {
      (prisma.match.findMany as any).mockResolvedValue([
        matchRecord({ id: 'm1', homeTeamId: 't1', awayTeamId: 't2', matchDate: new Date('2026-09-01T18:00:00Z') }),
        matchRecord({ id: 'm2', homeTeamId: 't3', awayTeamId: 't1', matchDate: new Date('2026-09-02T18:00:00Z') }),
      ]);

      const res = await matchHistoryProvider.getTeamMatches('t1', new Date('2026-09-10T00:00:00Z'));
      expect(res.length).toBe(2);
      expect(res.map((r) => r.matchId)).toEqual(['m1', 'm2']);
      expect((prisma.match.findMany as any).mock.calls[0][0].where.OR).toBeDefined();
      expect((prisma.match.findMany as any).mock.calls[0][0].where.matchDate.lt).toBeDefined();
    });

    it('strictly uses lt (less than) for asOf comparison', async () => {
      (prisma.match.findMany as any).mockResolvedValue([]);
      const asOf = new Date('2026-09-10T00:00:00Z');
      await matchHistoryProvider.getTeamMatches('t1', asOf);

      const findManyCall = (prisma.match.findMany as any).mock.calls[0][0];
      expect(findManyCall.where.matchDate.lt).toEqual(asOf);
      expect(findManyCall.where.matchDate.lte).toBeUndefined();
    });
  });

  describe('getRecentTeamMatches', () => {
    it('respects limit', async () => {
      (prisma.match.findMany as any).mockResolvedValue([
        matchRecord({ id: 'm3', matchDate: new Date('2026-09-10T18:00:00Z') }),
        matchRecord({ id: 'm4', matchDate: new Date('2026-09-11T18:00:00Z') }),
      ]);

      const res = await matchHistoryProvider.getRecentTeamMatches('t1', 2, new Date('2099-01-01T00:00:00Z'));
      expect(res.length).toBe(2);
      expect((prisma.match.findMany as any).mock.calls[0][0].take).toBe(2);
    });

    it('returns results in ASC chronological order from oldest to newest', async () => {
      (prisma.match.findMany as any).mockResolvedValue([
        matchRecord({ id: 'm6', matchDate: new Date('2026-09-06T18:00:00Z') }),
        matchRecord({ id: 'm5', matchDate: new Date('2026-09-05T18:00:00Z') }),
      ]);

      const res = await matchHistoryProvider.getRecentTeamMatches('t1', 2, new Date('2099-01-01T00:00:00Z'));
      expect(res[0].matchId).toBe('m5');
      expect(res[1].matchId).toBe('m6');
    });
  });

  describe('getHeadToHead', () => {
    it('finds both directions', async () => {
      (prisma.match.findMany as any).mockResolvedValue([
        matchRecord({ id: 'm7', homeTeamId: 'tA', awayTeamId: 'tB', matchDate: new Date('2026-09-01T18:00:00Z') }),
        matchRecord({ id: 'm8', homeTeamId: 'tB', awayTeamId: 'tA', matchDate: new Date('2026-09-02T18:00:00Z') }),
      ]);

      const res = await matchHistoryProvider.getHeadToHead('tA', 'tB', new Date('2026-09-10T00:00:00Z'));
      expect(res.length).toBe(2);
      expect(res.map((r) => r.matchId)).toEqual(['m7', 'm8']);
    });

    it('rejects same team for both args', async () => {
      await expect(matchHistoryProvider.getHeadToHead('tA', 'tA', new Date('2099-01-01T00:00:00Z'))).rejects.toThrow('must be different');
    });
  });

  it('returns null for missing scores instead of 0', async () => {
    (prisma.match.findMany as any).mockResolvedValue([
      matchRecord({ id: 'm9', homeScore: null, awayScore: null, status: 'SCHEDULED' }),
    ]);

    const res = await matchHistoryProvider.getTeamMatches('t1', new Date('2026-09-10T00:00:00Z'));
    expect(res[0].homeScore).toBeNull();
    expect(res[0].awayScore).toBeNull();
  });
});
