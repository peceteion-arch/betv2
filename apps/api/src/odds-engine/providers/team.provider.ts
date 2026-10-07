import { Team as PrismaTeam } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { Team } from './team.types';

function normalizeTeam(team: PrismaTeam): Team {
  return {
    id: team.id,
    name: team.name,
    sourceTeamId: team.sourceTeamId,
    logoUrl: team.logoUrl,
  };
}

export const teamProvider = {
  async getTeam(teamId: string): Promise<Team | null> {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
    });

    return team ? normalizeTeam(team) : null;
  },

  async getTeams(teamIds: string[]): Promise<Team[]> {
    if (teamIds.length === 0) {
      return [];
    }

    const teams = await prisma.team.findMany({
      where: {
        id: { in: teamIds },
      },
    });

    return teams.map(normalizeTeam);
  },
};
