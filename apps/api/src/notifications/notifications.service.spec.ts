import { NotFoundException } from '@nestjs/common';

import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  describe('createInTx', () => {
    it('writes a row inside the caller transaction', async () => {
      const tx = { notification: { create: jest.fn().mockResolvedValue({}) } } as any;
      const svc = new NotificationsService({} as any);

      await svc.createInTx(tx, {
        userId: 'u1',
        type: 'WAITLIST_PROMOTED',
        title: 'Promoted',
        body: 'You were enrolled.',
        payload: { enrollmentId: 'e1' },
      });

      expect(tx.notification.create).toHaveBeenCalledWith({
        data: {
          userId: 'u1',
          type: 'WAITLIST_PROMOTED',
          title: 'Promoted',
          body: 'You were enrolled.',
          payload: { enrollmentId: 'e1' },
        },
      });
    });
  });

  describe('list', () => {
    it('returns rows newest first with unreadCount, scoped to the user', async () => {
      const rows = [
        { id: 'n1', userId: 'u1', type: 'WAITLIST_PROMOTED', title: 't', body: 'b', payload: null, readAt: null, createdAt: new Date('2026-01-02') },
      ];
      const prisma = {
        notification: {
          findMany: jest.fn().mockResolvedValue(rows),
          count: jest.fn().mockResolvedValue(3),
        },
      } as any;
      const svc = new NotificationsService(prisma);

      const result = await svc.list('u1', {});

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      expect(prisma.notification.count).toHaveBeenCalledWith({ where: { userId: 'u1', readAt: null } });
      expect(result.unreadCount).toBe(3);
      expect(result.data).toEqual([
        { id: 'n1', type: 'WAITLIST_PROMOTED', title: 't', body: 'b', payload: undefined, readAt: null, createdAt: '2026-01-02T00:00:00.000Z' },
      ]);
    });

    it('filters to unread rows when unreadOnly is set and caps limit at 100', async () => {
      const prisma = {
        notification: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
      } as any;
      const svc = new NotificationsService(prisma);

      await svc.list('u1', { unreadOnly: true, limit: 500 });

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1', readAt: null },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    });
  });

  describe('markRead', () => {
    it('404s when the row does not exist', async () => {
      const prisma = { notification: { findUnique: jest.fn().mockResolvedValue(null) } } as any;
      const svc = new NotificationsService(prisma);
      await expect(svc.markRead('u1', 'n1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404s when the row belongs to someone else (no existence leak)', async () => {
      const prisma = {
        notification: {
          findUnique: jest.fn().mockResolvedValue({ id: 'n1', userId: 'someone-else', readAt: null }),
        },
      } as any;
      const svc = new NotificationsService(prisma);
      await expect(svc.markRead('u1', 'n1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('stamps readAt when currently unread', async () => {
      const row = {
        id: 'n1', userId: 'u1', type: 'WAITLIST_PROMOTED', title: 't', body: 'b', payload: null, readAt: null, createdAt: new Date('2026-01-01'),
      };
      const updated = { ...row, readAt: new Date('2026-01-02') };
      const prisma = {
        notification: {
          findUnique: jest.fn().mockResolvedValue(row),
          update: jest.fn().mockResolvedValue(updated),
        },
      } as any;
      const svc = new NotificationsService(prisma);

      const result = await svc.markRead('u1', 'n1');

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'n1' },
        data: { readAt: expect.any(Date) },
      });
      expect(result.readAt).toBe('2026-01-02T00:00:00.000Z');
    });

    it('is a no-op (no write) when already read', async () => {
      const row = {
        id: 'n1', userId: 'u1', type: 'WAITLIST_PROMOTED', title: 't', body: 'b', payload: null, readAt: new Date('2026-01-01'), createdAt: new Date('2026-01-01'),
      };
      const prisma = {
        notification: {
          findUnique: jest.fn().mockResolvedValue(row),
          update: jest.fn(),
        },
      } as any;
      const svc = new NotificationsService(prisma);

      await svc.markRead('u1', 'n1');

      expect(prisma.notification.update).not.toHaveBeenCalled();
    });
  });

  describe('markAllRead', () => {
    it('stamps every unread row for the user and returns the count', async () => {
      const prisma = { notification: { updateMany: jest.fn().mockResolvedValue({ count: 4 }) } } as any;
      const svc = new NotificationsService(prisma);

      const result = await svc.markAllRead('u1');

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', readAt: null },
        data: { readAt: expect.any(Date) },
      });
      expect(result).toEqual({ updated: 4 });
    });
  });
});
