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

  async create(data: { name: string; logoUrl?: string | null }) {
    const name = data.name.trim();
    if (name.length < 2 || name.length > 60) {
      throw new Error('Numele echipei trebuie să aibă între 2 și 60 de caractere');
    }

    const logoUrl = data.logoUrl?.trim() || null;

    const existing = await prisma.team.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
      },
    });

    if (existing) {
      throw new Error('Există deja o echipă cu acest nume');
    }

    return prisma.team.create({
      data: { name, logoUrl },
      select: { id: true, name: true, logoUrl: true },
    });
  },

  async update(id: string, data: { name?: string; logoUrl?: string | null }) {
    const name = data.name?.trim();
    const logoUrl = data.logoUrl?.trim() || null;

    if (name) {
      if (name.length < 2 || name.length > 60) {
        throw new Error('Numele echipei trebuie să aibă între 2 și 60 de caractere');
      }

      const existing = await prisma.team.findFirst({
        where: {
          id: { not: id },
          name: { equals: name, mode: 'insensitive' },
        },
      });

      if (existing) {
        throw new Error('Există deja o echipă cu acest nume');
      }
    }

    try {
      return await prisma.team.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(data.logoUrl !== undefined && { logoUrl }),
        },
        select: { id: true, name: true, logoUrl: true },
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new Error('Echipa nu a fost găsită');
      }
      throw error;
    }
  },
};