import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';

export const userService = {
  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
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
        createdAt: true,
      },
    });
    if (!user) throw new Error('Utilizador não encontrado');
    return {
      ...user,
      balance: Number(user.balance),
      roi: Number(user.roi),
      profit: Number(user.profit),
    };
  },

  async updateProfile(userId: string, data: { name?: string; email?: string }) {
    if (data.email) {
      const existing = await prisma.user.findFirst({
        where: { email: data.email, NOT: { id: userId } },
      });
      if (existing) throw new Error('Email já em uso');
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        balance: true,
      },
    });
    return { ...user, balance: Number(user.balance) };
  },

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('Utilizador não encontrado');

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new Error('Password atual incorreta');

    if (newPassword.length < 6) throw new Error('Nova password deve ter pelo menos 6 caracteres');

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { message: 'Password alterada com sucesso' };
  },

  async updateBalance(userId: string, amount: number) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { balance: { increment: amount } },
    });
    return { ...user, balance: Number(user.balance) };
  },

  async updateStats(userId: string, won: boolean, profit: number, stake?: number, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;

    const user = await client.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('Utilizador não encontrado');

    const newBetsCount = user.betsCount + 1;
    const newBetsWon = won ? user.betsWon + 1 : user.betsWon;
    const currentProfit = Number(user.profit);
    const newProfit = currentProfit + profit;

    const aggregated = await client.bet.aggregate({
      where: { userId, status: { in: ['WON', 'LOST'] } },
      _sum: { stake: true },
    });
    // Inside the settlement transaction the bet has already been flipped to
    // WON/LOST, so the aggregate already contains its stake — adding `stake`
    // on top would double-count it and halve the ROI.
    let totalStaked = Number(aggregated._sum.stake || 0);
    if (stake && !tx) totalStaked += stake;

    const newRoi = totalStaked > 0 ? (newProfit / totalStaked) * 100 : 0;

    return client.user.update({
      where: { id: userId },
      data: {
        betsCount: newBetsCount,
        betsWon: newBetsWon,
        profit: newProfit,
        roi: Math.round(newRoi * 100) / 100,
      },
    });
  },
};
