import { describe, it, expect, vi, beforeEach } from 'vitest';
import { teamProvider } from '../src/odds-engine/providers/team.provider';
import { prisma } from '../src/lib/prisma';

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    team: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe('teamProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getTeam returns normalized team when it exists', async () => {
    const mockTeam = {
      id: 'team-1',
      name: 'Echipa Test',
      sourceTeamId: 100,
      logoUrl: 'logo.png',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    (prisma.team.findUnique as any).mockResolvedValue(mockTeam);

    const result = await teamProvider.getTeam('team-1');

    expect(result).toEqual({
      id: 'team-1',
      name: 'Echipa Test',
      sourceTeamId: 100,
      logoUrl: 'logo.png',
    });
    expect(prisma.team.findUnique).toHaveBeenCalledWith({ where: { id: 'team-1' } });
  });

  it('getTeam returns null when team does not exist', async () => {
    (prisma.team.findUnique as any).mockResolvedValue(null);

    const result = await teamProvider.getTeam('non-existent');

    expect(result).toBeNull();
  });

  it('getTeams returns multiple normalized teams', async () => {
    const mockTeams = [
      {
        id: 'team-1',
        name: 'Echipa 1',
        sourceTeamId: 1,
        logoUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'team-2',
        name: 'Echipa 2',
        sourceTeamId: null,
        logoUrl: 'logo2.png',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    (prisma.team.findMany as any).mockResolvedValue(mockTeams);

    const result = await teamProvider.getTeams(['team-1', 'team-2']);

    expect(result).toHaveLength(2);
    expect(result).toEqual([
      { id: 'team-1', name: 'Echipa 1', sourceTeamId: 1, logoUrl: null },
      { id: 'team-2', name: 'Echipa 2', sourceTeamId: null, logoUrl: 'logo2.png' },
    ]);
  });

  it('getTeams returns empty array when input is empty', async () => {
    const result = await teamProvider.getTeams([]);
    expect(result).toEqual([]);
    expect(prisma.team.findMany).not.toHaveBeenCalled();
  });
});
