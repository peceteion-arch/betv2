import { prisma } from '../lib/prisma';

export const competitionService = {
  async list() {
    return prisma.competition.findMany({
      select: {
        id: true,
        name: true,
        logoUrl: true,
        active: true,
      },
      orderBy: { name: 'asc' },
    });
  },

  async create(data: { name: string; logoUrl?: string | null }) {
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
        logoUrl: data.logoUrl ?? null,
        active: true,
      },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        active: true,
      },
    });
  },

  async update(id: string, data: { name?: string; logoUrl?: string | null }) {
    // Validate name uniqueness if name is being updated
    if (data.name) {
      const existing = await prisma.competition.findFirst({
        where: { name: data.name, NOT: { id } }
      });
      if (existing) {
        throw new Error('Competition with this name already exists');
      }
    }

    return prisma.competition.update({
      where: { id },
      data: {
        name: data.name,
        logoUrl: data.logoUrl ?? null,
      },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        active: true,
      },
    });
  },

  async updateStatus(id: string, active: boolean) {
    return prisma.competition.update({
      where: { id },
      data: { active },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        active: true,
      },
    });
  },

  async getById(id: string) {
    return prisma.competition.findUnique({
      where: { id },
    });
  },
};