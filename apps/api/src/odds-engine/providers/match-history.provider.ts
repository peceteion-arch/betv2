import { prisma } from '../../lib/prisma';
import { NormalizedMatch } from './match-history.types';

function normalizeMatch(match: any): NormalizedMatch {
  return {
    matchId: match.id,
    homeTeamId: match.homeTeamId,
    awayTeamId: match.awayTeamId,
    homeTeamName: match.homeTeam?.name ?? '',
    awayTeamName: match.awayTeam?.name ?? '',
    competitionId: match.competitionId ?? null,
    matchday: match.matchday,
    matchDate: match.matchDate,
    status: match.status,
    homeScore: match.homeScore ?? null,
    awayScore: match.awayScore ?? null,
  };
}

export const matchHistoryProvider = {
  async getTeamMatches(teamId: string): Promise<NormalizedMatch[]> {
    const matches = await prisma.match.findMany({
      where: {
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        competition: true,
      },
      orderBy: { matchDate: 'asc' },
    });
    return matches.map(normalizeMatch);
  },

  async getRecentTeamMatches(teamId: string, limit: number): Promise<NormalizedMatch[]> {
    const matches = await prisma.match.findMany({
      where: {
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        competition: true,
      },
      orderBy: { matchDate: 'desc' },
      take: limit,
    });
    // Return in ASC chronological order from oldest to newest of selected
    return matches.reverse().map(normalizeMatch);
  },

  async getHeadToHead(teamAId: string, teamBId: string): Promise<NormalizedMatch[]> {
    if (teamAId === teamBId) {
      throw new Error('teamAId and teamBId must be different');
    }
    const matches = await prisma.match.findMany({
      where: {
        OR: [
          { homeTeamId: teamAId, awayTeamId: teamBId },
          { homeTeamId: teamBId, awayTeamId: teamAId },
        ],
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        competition: true,
      },
      orderBy: { matchDate: 'asc' },
    });
    return matches.map(normalizeMatch);
  },
};
