import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';

export const adminService = {
  async listUsers(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          balance: true,
          betsCount: true,
          betsWon: true,
          roi: true,
          profit: true,
          role: true,
          isBlocked: true,
          createdAt: true,
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count(),
    ]);
    const mappedUsers = users.map((u) => ({
      ...u,
      balance: Number(u.balance),
      roi: Number(u.roi),
      profit: Number(u.profit),
    }));
    return { users: mappedUsers, total, page, totalPages: Math.ceil(total / limit) };
  },

  async createUser(name: string, email: string, password: string, balance: number = 100) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new Error('Email já existe');

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, passwordHash, balance },
      select: { id: true, name: true, email: true, balance: true, role: true },
    });
    return { ...user, balance: Number(user.balance) };
  },

  async updateUser(userId: string, data: { balance?: number; isBlocked?: boolean; role?: string }) {
    if (data.balance !== undefined) {
      if (data.balance < 0) throw new Error('Saldo não pode ser negativo');
      if (data.balance > 1000000) throw new Error('Saldo demasiado alto');
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('Utilizador não encontrado');
    if (user.role === 'ADMIN' && data.isBlocked) {
      throw new Error('Não é possível bloquear administradores');
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, name: true, email: true, balance: true, role: true, isBlocked: true },
    });
    return { ...updated, balance: Number(updated.balance) };
  },

  async deleteUser(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('Utilizador não encontrado');
    if (user.role === 'ADMIN') throw new Error('Não é possível eliminar administradores');

    try {
      await prisma.user.delete({ where: { id: userId } });
    } catch (error) {
      // Handle foreign key constraint violations
      if ((error as any).code === 'P2003') {
        // Check if it's related to bets or groups (common relational conflicts)
        const [betCount, groupCount] = await Promise.all([
          prisma.bet.count({ where: { userId } }),
          prisma.group.count({ where: { adminId: userId } })
        ]);

        if (betCount > 0) {
          throw new Error('Utilizatorul nu poate fi șters deoarece are bilete asociate.');
        }
        if (groupCount > 0) {
          throw new Error('Utilizatorul nu poate fi șters deoarece are grupuri asociate.');
        }
        // Fallback for other relational constraints
        throw new Error('Utilizatorul nu poate fi șters deoarece are înregistrări asociate.');
      }
      // Re-throw other errors (e.g., unexpected database errors)
      throw error;
    }
  },

  async listGroups() {
    return prisma.group.findMany({
      include: {
        admin: { select: { id: true, name: true } },
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async deleteGroup(groupId: string) {
    return prisma.group.delete({ where: { id: groupId } });
  },

  async getStats() {
    const [totalUsers, totalBets, totalGroups, pendingBets, totalWon, totalLost] = await Promise.all([
      prisma.user.count(),
      prisma.bet.count(),
      prisma.group.count(),
      prisma.bet.count({ where: { status: 'PENDING' } }),
      prisma.bet.count({ where: { status: 'WON' } }),
      prisma.bet.count({ where: { status: 'LOST' } }),
    ]);
    return { totalUsers, totalBets, totalGroups, pendingBets, totalWon, totalLost };
  },
};
