import { prisma } from '../lib/prisma';

export const teamService = {
  async list() {
    return prisma.team.findMany({
      select: {
        id: true,
        name: true,
        logoUrl: true,
      },
      orderBy: { name: 'asc' },
    });
  },
};