import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { NotificationItem, NotificationsResponse, NotificationType } from '@enroll/shared';

import { PrismaService } from '../prisma/prisma.service';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Write a row inside the caller's transaction, so it commits atomically with the triggering mutation. */
  async createInTx(tx: Prisma.TransactionClient, input: CreateNotificationInput): Promise<void> {
    await tx.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        payload: input.payload as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async list(
    userId: string,
    opts: { unreadOnly?: boolean; limit?: number },
  ): Promise<NotificationsResponse> {
    const take = Math.min(opts.limit ?? 50, 100);
    const [rows, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { data: rows.map(toItem), unreadCount };
  }

  /** Stamps readAt if unread. 404s when the row does not exist or belongs to someone else (no existence leak). */
  async markRead(userId: string, id: string): Promise<NotificationItem> {
    const row = await this.prisma.notification.findUnique({ where: { id } });
    if (!row || row.userId !== userId) {
      throw new NotFoundException({
        code: 'NOTIFICATION_NOT_FOUND',
        message: 'Notification does not exist.',
      });
    }
    if (row.readAt) {
      return toItem(row);
    }
    const updated = await this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
    return toItem(updated);
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }
}

function toItem(row: {
  id: string;
  type: string;
  title: string;
  body: string;
  payload: Prisma.JsonValue;
  readAt: Date | null;
  createdAt: Date;
}): NotificationItem {
  return {
    id: row.id,
    type: row.type as NotificationType,
    title: row.title,
    body: row.body,
    payload: (row.payload as Record<string, unknown> | null) ?? undefined,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
