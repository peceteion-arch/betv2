import { describe, it, expect, vi } from 'vitest';
import { matchHistoryProvider } from '../../src/odds-engine/providers/match-history.provider';
import { NormalizedMatch } from '../../src/odds-engine/providers/match-history.types';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    match: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/lib/prisma';

describe('getCompetitionMatches real', () => {
  it('returns only eligible with lt filter', async () => {
    const mockDb = [
      { id: 'm1', homeTeamId: 't1', awayTeamId: 't2', homeTeam: { name: 'H' }, awayTeam: { name: 'A' }, competitionId: 'c1', matchday: 1, matchDate: new Date('2025-06-10'), status: 'FINISHED', homeScore: 2, awayScore: 1 },
      { id: 'm2', homeTeamId: 't1', awayTeamId: 't2', homeTeam: { name: 'H' }, awayTeam: { name: 'A' }, competitionId: 'c1', matchday: 1, matchDate: new Date('2025-06-10'), status: 'SCHEDULED', homeScore: null, awayScore: null },
      { id: 'm3', homeTeamId: 't1', awayTeamId: 't2', homeTeam: { name: 'H' }, awayTeam: { name: 'A' }, competitionId: 'c1', matchday: 1, matchDate: new Date('2025-06-10'), status: 'FINISHED', homeScore: -1, awayScore: 2 },
      { id: 'm4', homeTeamId: 't1', awayTeamId: 't2', homeTeam: { name: 'H' }, awayTeam: { name: 'A' }, competitionId: 'c1', matchday: 1, matchDate: new Date('2025-06-15'), status: 'FINISHED', homeScore: 0, awayScore: 0 },
    ];
    vi.mocked(prisma.match.findMany).mockResolvedValue(mockDb as any);
    const asOf = new Date('2025-06-15');
    const res = await matchHistoryProvider.getCompetitionMatches('c1', asOf);
    // m4 exclude pentru == asOf; m2 SCHEDULED; m3 negativ; m1 inclus
    expect(res.length).toBe(1);
    expect(res[0].matchId).toBe('m1');
    expect(res[0].homeScore).toBe(2);
    // Verificăm că Prisma a primit lt
    const call = vi.mocked(prisma.match.findMany).mock.calls[0][0];
    expect(call).toMatchObject({ where: { competitionId: 'c1', matchDate: { lt: asOf } } });
  });

  it('keeps 0-0 as eligible', async () => {
    const mockDb = [
      { id: 'm1', homeTeamId: 't1', awayTeamId: 't2', homeTeam: { name: 'H' }, awayTeam: { name: 'A' }, competitionId: 'c1', matchday: 1, matchDate: new Date('2025-06-10'), status: 'FINISHED', homeScore: 0, awayScore: 0 },
    ];
    vi.mocked(prisma.match.findMany).mockResolvedValue(mockDb as any);
    const res = await matchHistoryProvider.getCompetitionMatches('c1', new Date('2025-06-20'));
    expect(res.length).toBe(1);
    expect(res[0].homeScore).toBe(0);
  });
});
