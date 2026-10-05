import { prisma } from '../lib/prisma';

export const competitionService = {
  async list() {
    return prisma.competition.findMany({
      select: {
        id: true,
        name: true,
        emoji: true,
        logoUrl: true,
      },
      orderBy: { name: 'asc' },
    });
  },

  async create(data: { name: string; emoji?: string | null; logoUrl?: string | null }) {
    // Check if competition with same name already exists
    const existing = await prisma.competition.findUnique({
      where: { name: data.name },
    });
    if (existing) {
      throw new Error('Competition with this name already exists');
    }

    return prisma.competition.create({
      data: {
        name: data.name,
        emoji: data.emoji ?? null,
        logoUrl: data.logoUrl ?? null,
      },
      select: {
        id: true,
        name: true,
        emoji: true,
        logoUrl: true,
      },
    });
  },
};