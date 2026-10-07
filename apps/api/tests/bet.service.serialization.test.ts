import { describe, it, expect, beforeEach, vi } from 'vitest';
import { matchService } from '../src/services/match.service';
import { betService, OddsChangedError } from '../src/services/bet.service';
import { prisma } from '../src/lib/prisma';
import { notificationService } from '../src/services/notification.service';

vi.mock('../src/services/notification.service', () => ({
  notificationService: {
    create: vi.fn().mockResolvedValue({}),
  },
}));

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
    notification: {
      create: vi.fn(),
    },
    $transaction: async (fn: any) => await fn({
      user: prisma.user,
      bet: prisma.bet,
      match: prisma.match,
      odds: prisma.odds,
      oddsChange: prisma.oddsChange,
      notification: prisma.notification,
    }),
  },
}));

const scheduledMatch = () => ({
  id: 'm1',
  status: 'SCHEDULED',
  matchDate: new Date(Date.now() + 86400000),
  homeTeam: { name: 'T1', logoUrl: null },
  awayTeam: { name: 'T2', logoUrl: null },
  competition: { id: 'c1', name: 'C1', logoUrl: null, active: true },
});

describe('Bet placement validation (OddsChangedError)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('cota scăzută → OddsChangedError cu newOdds corect', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ id: 'u1', balance: 100, isBlocked: false });
    (prisma.match.findUnique as any).mockResolvedValue(scheduledMatch());
    // DB: 1.80, utilizatorul a trimis 1.90 → cota s-a înrăutățit
    (prisma.odds.findFirst as any).mockResolvedValueOnce({ value: 1.80, enabled: true });

    const selections = [{ matchId: 'm1', market: '1X2', selection: '1', odds: 1.90 }];

    const err: any = await betService.placeBet('u1', 10, selections as any).catch((e) => e);

    expect(err).toBeInstanceOf(OddsChangedError);
    expect(err.changes).toEqual([
      {
        matchId: 'm1',
        market: '1X2',
        selection: '1',
        oldOdds: 1.90,
        newOdds: 1.80,
        available: true,
      },
    ]);
    expect(prisma.bet.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('cota dezactivată → OddsChangedError cu available:false', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ id: 'u1', balance: 100, isBlocked: false });
    (prisma.match.findUnique as any).mockResolvedValue(scheduledMatch());
    (prisma.odds.findFirst as any).mockResolvedValueOnce({ value: 1.90, enabled: false });

    const selections = [{ matchId: 'm1', market: '1X2', selection: '1', odds: 1.90 }];

    const err: any = await betService.placeBet('u1', 10, selections as any).catch((e) => e);

    expect(err).toBeInstanceOf(OddsChangedError);
    expect(err.changes).toEqual([
      { matchId: 'm1', market: '1X2', selection: '1', oldOdds: 1.90, newOdds: 0, available: false },
    ]);
    expect(prisma.bet.create).not.toHaveBeenCalled();
  });

  it('cota neschimbată → bilet plasat', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ id: 'u1', balance: 100, isBlocked: false });
    (prisma.user.update as any).mockResolvedValue({ balance: 90 });
    (prisma.match.findUnique as any).mockResolvedValue(scheduledMatch());
    (prisma.odds.findFirst as any).mockResolvedValueOnce({ value: 1.90, enabled: true });

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

  it('cota crescută → bilet plasat fără confirmare, la cota nouă (mai mare)', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ id: 'u1', balance: 100, isBlocked: false });
    (prisma.user.update as any).mockResolvedValue({ balance: 90 });
    (prisma.match.findUnique as any).mockResolvedValue(scheduledMatch());
    // DB: 2.10, utilizatorul a trimis 1.90 → cota s-a îmbunătățit
    (prisma.odds.findFirst as any).mockResolvedValueOnce({ value: 2.10, enabled: true });

    (prisma.bet.create as any).mockResolvedValue({
      id: 'b2',
      stake: 10,
      totalOdds: 2.1,
      potentialReturn: 21,
      selections: [],
    });

    const selections = [{ matchId: 'm1', market: '1X2', selection: '1', odds: 1.90 }];

    const result: any = await betService.placeBet('u1', 10, selections as any);

    expect(prisma.bet.create).toHaveBeenCalledTimes(1);
    const createArg = (prisma.bet.create as any).mock.calls[0][0];
    expect(createArg.data.totalOdds).toBe(2.1);
    expect(createArg.data.potentialReturn).toBe(21);
    expect(createArg.data.selections.create[0].odds).toBe(2.1);

    expect(result.stake).toBe(10);
    expect(result.totalOdds).toBe(2.1);
    expect(result.potentialReturn).toBe(21);
  });

  it('mai multe selecții schimbate → toate apar în changes', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ id: 'u1', balance: 100, isBlocked: false });
    (prisma.user.update as any).mockResolvedValue({ balance: 90 });
    (prisma.match.findUnique as any).mockResolvedValue(scheduledMatch());

    (prisma.odds.findFirst as any)
      .mockResolvedValueOnce({ value: 1.70, enabled: true })   // scăzută față de 1.90
      .mockResolvedValueOnce({ value: 1.50, enabled: false }); // dezactivată

    const selections = [
      { matchId: 'm1', market: '1X2', selection: '1', odds: 1.90 },
      { matchId: 'm1', market: 'MARCAS_0_5', selection: 'Mais 0.5', odds: 1.50 },
    ];

    const err: any = await betService.placeBet('u1', 10, selections as any).catch((e) => e);

    expect(err).toBeInstanceOf(OddsChangedError);
    expect(err.changes).toEqual([
      expect.objectContaining({ market: '1X2', oldOdds: 1.90, newOdds: 1.70, available: true }),
      expect.objectContaining({ market: 'MARCAS_0_5', oldOdds: 1.50, newOdds: 0, available: false }),
    ]);
    expect(prisma.bet.create).not.toHaveBeenCalled();
  });
});

describe('Match odds visibility + odds management', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getById/listUpcoming pentru non-admin nu returnează enabled=false', async () => {
    (prisma.match.findUnique as any).mockResolvedValue({
      id: 'm1',
      status: 'SCHEDULED',
      matchDate: new Date(Date.now() + 86400000),
      homeTeam: { id: 't1', name: 'T1', logoUrl: null },
      awayTeam: { id: 't2', name: 'T2', logoUrl: null },
      competition: { id: 'c1', name: 'C1', logoUrl: null, active: true },
      odds: [
        { id: 'o1', market: '1X2', selection: '1', value: 1.90, enabled: true },
        { id: 'o2', market: '1X2', selection: 'X', value: 3.50, enabled: false },
      ],
    });

    const m = await matchService.getById('m1', false);
    expect(m.odds.every((o: any) => o.enabled)).toBe(true);
  });

  it('updateOdds: meci LIVE respins, istoric creat, reset revine la originalValue', async () => {
    (prisma.match.findUnique as any).mockResolvedValueOnce({ id: 'm1', status: 'LIVE', matchDate: new Date() });

    await expect(matchService.updateOdds('m1', 'admin1', [{ market: '1X2', selection: '1', value: 2.1, enabled: true } as any])).rejects.toThrow(
      'Only scheduled matches can have odds edited'
    );

    (prisma.match.findUnique as any).mockResolvedValueOnce({ id: 'm1', status: 'SCHEDULED', matchDate: new Date(Date.now() + 86400000) });

    (prisma.odds.findUnique as any).mockResolvedValue({
      id: 'o1',
      value: 1.9,
      enabled: true,
      originalValue: 1.8,
      market: '1X2',
      selection: '1',
    });

    (prisma.oddsChange.create as any).mockResolvedValue({});

    await matchService.updateOdds('m1', 'admin1', [{ market: '1X2', selection: '1', value: 2.1, enabled: false } as any]);
    expect(prisma.oddsChange.create).toHaveBeenCalled();

    (prisma.odds.findMany as any).mockResolvedValue([
      { id: 'o1', market: '1X2', selection: '1', value: 2.1, originalValue: 1.8, enabled: false },
    ]);

    await matchService.resetOdds('m1', 'admin1');
    expect(prisma.odds.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ value: 1.8, enabled: true }),
      })
    );
  });
});
