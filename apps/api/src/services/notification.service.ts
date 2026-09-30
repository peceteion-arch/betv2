import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

export const notificationService = {
  async create(userId: string, type: string, message: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    return client.notification.create({
      data: {
        userId,
        type,
        message,
      },
    });
  },

  async listByUser(userId: string) {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  },

  async markRead(notificationId: string, userId: string) {
    // Verify ownership
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification) throw new Error('Notification not found');
    if (notification.userId !== userId) throw new Error('Not your notification');

    return prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
    });
  },

  async markAllRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  },

  async getUnreadCount(userId: string) {
    return prisma.notification.count({
      where: { userId, read: false },
    });
  },
};
