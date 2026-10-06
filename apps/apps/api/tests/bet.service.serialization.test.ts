import { describe, it, expect, beforeEach, vi } from 'vitest';
import { matchService } from '../src/services/match.service';
import { betService, OddsChangedError } from '../src/services/bet.service';
import { prisma } from '../src/lib/prisma';

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    bet: {
      create: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    match: {
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    odds: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      createMany: vi.fn(),
    },
    oddsChange: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: async (fn: any) => await fn({
      user: prisma.user,
      bet: prisma.bet,
      match: prisma.match,
      odds: prisma.odds,
      oddsChange: prisma.oddsChange,
    }),
  },
}));

describe('Bet placement validation (OddsChangedError)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cota schimbată → OddsChangedError cu newOdds corect', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ id: 'u1', balance: 100, isBlocked: false });
    (prisma.match.findUnique as any).mockResolvedValue({
      id: 'm1',
      status: 'SCHEDULED',
      matchDate: new Date(Date.now() + 86400000),
      homeTeam: { name: 'T1' },
      awayTeam: { name: 'T2' },
    });
    (prisma.odds.findFirst as any).mockResolvedValue({ value: 2.10, enabled: true });

    const selections = [{ matchId: 'm1', market: '1X2', selection: '1', odds: 1.90 }];

    await expect(betService.placeBet('u1', 10, selections as any)).rejects.toBeInstanceOf(OddsChangedError);

    await expect(betService.placeBet('u1', 10, selections as any)).rejects.toMatchObject({
      changes: [
        {
          matchId: 'm1',
          market: '1X2',
          selection: '1',
          oldOdds: 1.90,
          newOdds: 2.10,
          available: true,
        },
      ],
    });
  });

  it('cota dezactivată → OddsChangedError cu available:false', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ id: 'u1', balance: 100, isBlocked: false });
    (prisma.match.findUnique as any).mockResolvedValue({
      id: 'm1',
      status: 'SCHEDULED',
      matchDate: new Date(Date.now() + 86400000),
      homeTeam: { name: 'T1' },
      awayTeam: { name: 'T2' },
    });
    (prisma.odds.findFirst as any).mockResolvedValue({ value: 1.90, enabled: false });

    const selections = [{ matchId: 'm1', market: '1X2', selection: '1', odds: 1.90 }];

    await expect(betService.placeBet('u1', 10, selections as any)).rejects.toMatchObject({
      changes: [
        { matchId: 'm1', market: '1X2', selection: '1', oldOdds: 1.90, newOdds: 0, available: false },
      ],
    });
  });

  it('cota neschimbată → bilet plasat', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ id: 'u1', balance: 100, isBlocked: false });
    (prisma.match.findUnique as any).mockResolvedValue({
      id: 'm1',
      status: 'SCHEDULED',
      matchDate: new Date(Date.now() + 86400000),
      homeTeam: { name: 'T1' },
      awayTeam: { name: 'T2' },
    });
    (prisma.odds.findFirst as any).mockResolvedValue({ value: 1.90, enabled: true });

    (prisma.bet.create as any).mockResolvedValue({
      id: 'b1',
      stake: 10,
      totalOdds: 1.9,
      potentialReturn: 19,
      selections: [],
    });

    const selections = [{ matchId: 'm1', market: '1X2', selection: '1', odds: 1.90 }];

    await expect(betService.placeBet('u1', 10, selections as any)).resolves.toBeDefined();
    expect(prisma.bet.create).toHaveBeenCalled();
  });

  it('mai multe selecții schimbate → toate apar în changes', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ id: 'u1', balance: 100, isBlocked: false });
    (prisma.match.findUnique as any).mockResolvedValue({
      id: 'm1',
      status: 'SCHEDULED',
      matchDate: new Date(Date.now() + 86400000),
      homeTeam: { name: 'T1' },
      awayTeam: { name: 'T2' },
    });

    (prisma.odds.findFirst as any)
      .mockResolvedValueOnce({ value: 2.10, enabled: true })
      .mockResolvedValueOnce({ value: 1.50, enabled: false });

    const selections = [
      { matchId: 'm1', market: '1X2', selection: '1', odds: 1.90 },
      { matchId: 'm1', market: 'MARCAS_0_5', selection: 'Mais 0.5', odds: 1.50 },
    ];

    await expect(betService.placeBet('u1', 10, selections as any)).rejects.toMatchObject({
      changes: [
        expect.objectContaining({ market: '1X2', available: true }),
        expect.objectContaining({ market: 'MARCAS_0_5', available: false }),
      ],
    });
  });
});

describe('Odds listing/reset permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getById/listUpcoming pentru non-admin nu returnează enabled=false', async () => {
    (prisma.match.findUnique as any).mockResolvedValue({
      id: 'm1',
      status: 'SCHEDULED',
      matchDate: new Date(Date.now() + 86400000),
      homeTeam: { id: 't1', name: 'T1' },
      awayTeam: { id: 't2', name: 'T2' },
      competition: null,
      odds: [
        { id: 'o1', market: '1X2', selection: '1', value: 1.90, enabled: true },
        { id: 'o2', market: '1X2', selection: 'X', value: 3.50, enabled: false },
      ],
    });

    const m = await matchService.getById('m1', false);
    expect(m.odds.every((o: any) => o.enabled)).toBe(true);
  });

  it('updateOdds: meci LIVE respins, istoric creat, reset revine la originalValue', async () => {
    (prisma.match.findUnique as any).mockResolvedValue({ id: 'm1', status: 'LIVE', matchDate: new Date() });
    await expect(matchService.updateOdds('m1', 'a1', [{ market: '1X2', selection: '1', value: 2.1, enabled: true } as any])).rejects.toThrow('Only scheduled matches can have odds edited');

    // History + reset: simulate scheduled
    (prisma.match.findUnique as any).mockResolvedValue({ id: 'm1', status: 'SCHEDULED', matchDate: new Date(Date.now() + 86400000) });
    (prisma.odds.findUnique as any).mockResolvedValue({
      id: 'o1',
      value: 1.9,
      enabled: true,
      originalValue: 1.8,
      market: '1X2',
      selection: '1',
    });
    (prisma.oddsChange.create as any).mockResolvedValue({});

    await matchService.updateOdds('m1', 'a1', [{ market: '1X2', selection: '1', value: 2.1, enabled: false } as any]);
    expect(prisma.oddsChange.create).toHaveBeenCalled();

    (prisma.odds.findMany as any).mockResolvedValue([
      { id: 'o1', market: '1X2', selection: '1', value: 2.1, originalValue: 1.8, enabled: false },
    ]);
    await matchService.resetOdds('m1', 'a1');

    expect(prisma.odds.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ value: 1.8, enabled: true }),
      })
    );
  });
});
