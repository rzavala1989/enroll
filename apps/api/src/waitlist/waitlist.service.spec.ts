import { ConflictException, NotFoundException } from '@nestjs/common';
import { EnrollmentStatus } from '@prisma/client';
import { AuditAction } from '@enroll/shared';

import { WaitlistService } from './waitlist.service';

import { stubMetrics, stubSchedulerGate } from '../common/metrics.stub';

/** Positional constructor args the specs care about; metrics and the scheduler gate are stubbed. */
function makeWaitlistService(
  prisma: any,
  audit: any,
  notifications: any,
  queue: any,
): WaitlistService {
  return new WaitlistService(
    prisma,
    audit,
    notifications,
    stubMetrics(),
    stubSchedulerGate(),
    queue,
  );
}

const ACTOR = { userId: 'admin-1', ipAddress: '127.0.0.1', userAgent: 'jest' };

describe('WaitlistService', () => {
  describe('assignPosition', () => {
    it('returns 1 for an empty waitlist', async () => {
      const tx = {
        enrollment: {
          aggregate: jest.fn().mockResolvedValue({ _max: { waitlistPosition: null } }),
        },
      } as any;
      const svc = makeWaitlistService({} as any, {} as any, {} as any, {} as any);
      await expect(svc.assignPosition(tx, 'sec-1')).resolves.toBe(1);
      expect(tx.enrollment.aggregate).toHaveBeenCalledWith({
        where: { sectionId: 'sec-1', status: EnrollmentStatus.WAITLISTED },
        _max: { waitlistPosition: true },
      });
    });

    it('returns the current max plus one when the waitlist is non-empty', async () => {
      const tx = {
        enrollment: {
          aggregate: jest.fn().mockResolvedValue({ _max: { waitlistPosition: 7 } }),
        },
      } as any;
      const svc = makeWaitlistService({} as any, {} as any, {} as any, {} as any);
      await expect(svc.assignPosition(tx, 'sec-1')).resolves.toBe(8);
    });
  });

  describe('computeRank', () => {
    it('counts WAITLISTED rows with position at or below the given position', async () => {
      const db = { enrollment: { count: jest.fn().mockResolvedValue(2) } } as any;
      const svc = makeWaitlistService({} as any, {} as any, {} as any, {} as any);
      await expect(svc.computeRank(db, 'sec-1', 5)).resolves.toBe(2);
      expect(db.enrollment.count).toHaveBeenCalledWith({
        where: {
          sectionId: 'sec-1',
          status: EnrollmentStatus.WAITLISTED,
          waitlistPosition: { lte: 5 },
        },
      });
    });
  });

  describe('enqueuePromotion', () => {
    it('coalesces by section and asks BullMQ to retry with backoff', async () => {
      const queue = { add: jest.fn().mockResolvedValue(undefined) } as any;
      const svc = makeWaitlistService({} as any, {} as any, {} as any, queue);

      await svc.enqueuePromotion('sec-1');

      expect(queue.add).toHaveBeenCalledWith(
        'promote',
        { sectionId: 'sec-1' },
        expect.objectContaining({
          jobId: 'sec-1',
          attempts: 5,
          backoff: { type: 'exponential', delay: 1000 },
        }),
      );
    });

    it('swallows a queue outage so the drop that triggered it still commits', async () => {
      const queue = {
        add: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      } as any;
      const svc = makeWaitlistService({} as any, {} as any, {} as any, queue);

      await expect(svc.enqueuePromotion('sec-1')).resolves.toBeUndefined();
    });
  });

  describe('sweepPromotable', () => {
    it('re-enqueues every section left with an open seat and a waiting student', async () => {
      const prisma = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: 'sec-1' }, { id: 'sec-2' }]),
      } as any;
      const queue = { add: jest.fn().mockResolvedValue(undefined) } as any;
      const svc = makeWaitlistService(prisma, {} as any, {} as any, queue);

      await svc.sweepPromotable();

      // This is the recovery path for a job coalesced away against an
      // active run, lost to a Redis outage, or out of retries.
      expect(queue.add).toHaveBeenCalledTimes(2);
      expect(queue.add.mock.calls.map((c: unknown[]) => c[1])).toEqual([
        { sectionId: 'sec-1' },
        { sectionId: 'sec-2' },
      ]);
    });

    it('does nothing when no section is stuck', async () => {
      const prisma = { $queryRaw: jest.fn().mockResolvedValue([]) } as any;
      const queue = { add: jest.fn() } as any;
      const svc = makeWaitlistService(prisma, {} as any, {} as any, queue);

      await svc.sweepPromotable();

      expect(queue.add).not.toHaveBeenCalled();
    });

    it('stays out of the way in a replica with schedulers disabled', async () => {
      const prisma = { $queryRaw: jest.fn() } as any;
      const svc = new WaitlistService(
        prisma,
        {} as any,
        {} as any,
        stubMetrics(),
        stubSchedulerGate(false),
        {} as any,
      );

      await svc.sweepPromotable();

      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('runPromotion', () => {
    function makeTx(opts: {
      capacity: number;
      enrolledCount: number;
      registrationCloses: Date;
      waitlist: Array<{ id: string; waitlistPosition: number }>;
    }) {
      const queue = [...opts.waitlist];
      return {
        $queryRaw: jest.fn().mockResolvedValue([
          {
            capacity: opts.capacity,
            enrolledCount: opts.enrolledCount,
            registrationCloses: opts.registrationCloses,
            courseId: 'course-1',
            courseCode: 'CS101',
            sectionNumber: '001',
          },
        ]),
        enrollment: {
          findFirst: jest
            .fn()
            .mockImplementation(async () =>
              queue[0] ? { ...queue[0], sectionId: 'sec-1' } : null,
            ),
          update: jest.fn().mockImplementation(async ({ where }: any) => {
            const idx = queue.findIndex((q) => q.id === where.id);
            queue.splice(idx, 1);
            return {
              id: where.id,
              sectionId: 'sec-1',
              status: EnrollmentStatus.ENROLLED,
              studentId: `student-${where.id}`,
            };
          }),
        },
        section: { update: jest.fn().mockResolvedValue({}) },
        _queueRemaining: () => queue,
      } as any;
    }

    function makePrisma(tx: any) {
      return {
        $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
      } as any;
    }

    const audit = { recordEvent: jest.fn().mockResolvedValue(undefined) } as any;
    const notifications = { createInTx: jest.fn().mockResolvedValue(undefined) } as any;
    const future = new Date(Date.now() + 86_400_000);
    const past = new Date(Date.now() - 86_400_000);

    beforeEach(() => {
      audit.recordEvent.mockClear();
      notifications.createInTx.mockClear();
    });

    it('fills all open seats in position order, notifying each promoted student', async () => {
      const tx = makeTx({
        capacity: 3,
        enrolledCount: 1,
        registrationCloses: future,
        waitlist: [
          { id: 'e1', waitlistPosition: 2 },
          { id: 'e2', waitlistPosition: 5 },
          { id: 'e3', waitlistPosition: 9 },
        ],
      });
      const svc = makeWaitlistService(makePrisma(tx), audit, notifications, {} as any);
      await svc.runPromotion('sec-1');
      expect(tx.enrollment.update).toHaveBeenCalledTimes(2); // 2 open seats
      expect(tx.enrollment.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: {
          status: EnrollmentStatus.ENROLLED,
          enrolledAt: expect.any(Date),
          waitlistPosition: null,
        },
        select: { id: true, sectionId: true, status: true, studentId: true },
      });
      expect(tx.section.update).toHaveBeenCalledWith({
        where: { id: 'sec-1' },
        data: { enrolledCount: 3 },
      });
      expect(audit.recordEvent).toHaveBeenCalledTimes(2);
      expect(audit.recordEvent.mock.calls[0][1].action).toBe(
        AuditAction.ENROLLMENT_PROMOTED,
      );
      expect(notifications.createInTx).toHaveBeenCalledTimes(2);
      expect(notifications.createInTx).toHaveBeenCalledWith(tx, {
        userId: 'student-e1',
        type: 'WAITLIST_PROMOTED',
        title: expect.any(String),
        body: expect.stringContaining('CS101 section 001'),
        payload: { enrollmentId: 'e1', sectionId: 'sec-1', courseId: 'course-1' },
      });
      expect(tx._queueRemaining().map((q: any) => q.id)).toEqual(['e3']);
    });

    it('does nothing when there are no open seats', async () => {
      const tx = makeTx({
        capacity: 2,
        enrolledCount: 2,
        registrationCloses: future,
        waitlist: [{ id: 'e1', waitlistPosition: 1 }],
      });
      const svc = makeWaitlistService(makePrisma(tx), audit, notifications, {} as any);
      await svc.runPromotion('sec-1');
      expect(tx.enrollment.update).not.toHaveBeenCalled();
      expect(tx.section.update).not.toHaveBeenCalled();
      expect(audit.recordEvent).not.toHaveBeenCalled();
      expect(notifications.createInTx).not.toHaveBeenCalled();
    });

    it('does nothing when registration has closed', async () => {
      const tx = makeTx({
        capacity: 5,
        enrolledCount: 0,
        registrationCloses: past,
        waitlist: [{ id: 'e1', waitlistPosition: 1 }],
      });
      const svc = makeWaitlistService(makePrisma(tx), audit, notifications, {} as any);
      await svc.runPromotion('sec-1');
      expect(tx.enrollment.update).not.toHaveBeenCalled();
      expect(tx.section.update).not.toHaveBeenCalled();
    });

    it('stops when the waitlist empties before the section fills', async () => {
      const tx = makeTx({
        capacity: 10,
        enrolledCount: 0,
        registrationCloses: future,
        waitlist: [
          { id: 'e1', waitlistPosition: 1 },
          { id: 'e2', waitlistPosition: 2 },
        ],
      });
      const svc = makeWaitlistService(makePrisma(tx), audit, notifications, {} as any);
      await svc.runPromotion('sec-1');
      expect(tx.enrollment.update).toHaveBeenCalledTimes(2);
      expect(tx.section.update).toHaveBeenCalledWith({
        where: { id: 'sec-1' },
        data: { enrolledCount: 2 },
      });
    });
  });

  describe('reorder', () => {
    function makeTx(opts: { section: { id: string } | null; waitlisted: string[] }) {
      return {
        $queryRaw: jest.fn().mockResolvedValue(opts.section ? [opts.section] : []),
        enrollment: {
          findMany: jest.fn().mockResolvedValue(opts.waitlisted.map((id) => ({ id }))),
          update: jest.fn().mockResolvedValue({}),
        },
      } as any;
    }

    function makePrisma(tx: any, listRows: any[] = []) {
      return {
        $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
        enrollment: { findMany: jest.fn().mockResolvedValue(listRows) },
      } as any;
    }

    const audit = { recordEvent: jest.fn().mockResolvedValue(undefined) } as any;

    beforeEach(() => audit.recordEvent.mockClear());

    it('404s when the section does not exist', async () => {
      const tx = makeTx({ section: null, waitlisted: [] });
      const svc = makeWaitlistService(makePrisma(tx), audit, {} as any, {} as any);
      await expect(svc.reorder('sec-1', ['e1'], ACTOR)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(tx.enrollment.update).not.toHaveBeenCalled();
    });

    it('409s WAITLIST_CHANGED when a currently WAITLISTED id is missing from the submission', async () => {
      const tx = makeTx({ section: { id: 'sec-1' }, waitlisted: ['e1', 'e2'] });
      const svc = makeWaitlistService(makePrisma(tx), audit, {} as any, {} as any);
      await expect(svc.reorder('sec-1', ['e1'], ACTOR)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(tx.enrollment.update).not.toHaveBeenCalled();
      expect(audit.recordEvent).not.toHaveBeenCalled();
    });

    it('409s WAITLIST_CHANGED when the submission includes an id no longer on the waitlist', async () => {
      const tx = makeTx({ section: { id: 'sec-1' }, waitlisted: ['e1', 'e2'] });
      const svc = makeWaitlistService(makePrisma(tx), audit, {} as any, {} as any);
      await expect(
        svc.reorder('sec-1', ['e1', 'e2', 'e3'], ACTOR),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.enrollment.update).not.toHaveBeenCalled();
    });

    it('409s WAITLIST_CHANGED when the submission both drops and adds an id', async () => {
      const tx = makeTx({ section: { id: 'sec-1' }, waitlisted: ['e1', 'e2'] });
      const svc = makeWaitlistService(makePrisma(tx), audit, {} as any, {} as any);
      await expect(svc.reorder('sec-1', ['e1', 'e3'], ACTOR)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(tx.enrollment.update).not.toHaveBeenCalled();
    });

    it('renumbers positions 1..N in submitted order, audits, and returns the refreshed list', async () => {
      const tx = makeTx({ section: { id: 'sec-1' }, waitlisted: ['e1', 'e2', 'e3'] });
      const listRows = [
        {
          id: 'e3',
          studentId: 's3',
          createdAt: new Date('2026-01-01'),
          student: { firstName: 'C', lastName: 'C' },
        },
        {
          id: 'e1',
          studentId: 's1',
          createdAt: new Date('2026-01-02'),
          student: { firstName: 'A', lastName: 'A' },
        },
        {
          id: 'e2',
          studentId: 's2',
          createdAt: new Date('2026-01-03'),
          student: { firstName: 'B', lastName: 'B' },
        },
      ];
      const svc = makeWaitlistService(
        makePrisma(tx, listRows),
        audit,
        {} as any,
        {} as any,
      );

      const result = await svc.reorder('sec-1', ['e3', 'e1', 'e2'], ACTOR);

      expect(tx.enrollment.update).toHaveBeenCalledTimes(3);
      expect(tx.enrollment.update).toHaveBeenCalledWith({
        where: { id: 'e3' },
        data: { waitlistPosition: 1 },
      });
      expect(tx.enrollment.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: { waitlistPosition: 2 },
      });
      expect(tx.enrollment.update).toHaveBeenCalledWith({
        where: { id: 'e2' },
        data: { waitlistPosition: 3 },
      });

      expect(audit.recordEvent).toHaveBeenCalledTimes(1);
      const event = audit.recordEvent.mock.calls[0][1];
      expect(event.action).toBe(AuditAction.WAITLIST_REORDERED);
      expect(event.before).toEqual({ orderedEnrollmentIds: ['e1', 'e2', 'e3'] });
      expect(event.after).toEqual({ orderedEnrollmentIds: ['e3', 'e1', 'e2'] });

      expect(result.map((r) => r.enrollmentId)).toEqual(['e3', 'e1', 'e2']);
      expect(result.map((r) => r.position)).toEqual([1, 2, 3]);
    });
  });

  describe('expireClosedWaitlists', () => {
    function makeTx(
      waitlisted: Array<{ id: string; studentId: string; waitlistPosition: number }>,
    ) {
      return {
        $queryRaw: jest.fn().mockResolvedValue([{ id: 'sec-1' }]),
        enrollment: {
          findMany: jest.fn().mockResolvedValue(waitlisted),
          update: jest.fn().mockResolvedValue({}),
        },
      } as any;
    }

    const audit = { recordEvent: jest.fn().mockResolvedValue(undefined) } as any;
    const notifications = { createInTx: jest.fn().mockResolvedValue(undefined) } as any;

    beforeEach(() => {
      audit.recordEvent.mockClear();
      notifications.createInTx.mockClear();
    });

    it('does nothing when no section has an open waitlist past registration close', async () => {
      const prisma = {
        enrollment: { findMany: jest.fn().mockResolvedValue([]) },
        $transaction: jest.fn(),
      } as any;
      const svc = makeWaitlistService(prisma, audit, notifications, {} as any);

      await svc.expireClosedWaitlists();

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('drops every WAITLISTED row for each affected section, auditing and notifying per row', async () => {
      const tx = makeTx([
        { id: 'e1', studentId: 'student-1', waitlistPosition: 1 },
        { id: 'e2', studentId: 'student-2', waitlistPosition: 2 },
      ]);
      const prisma = {
        enrollment: { findMany: jest.fn().mockResolvedValue([{ sectionId: 'sec-1' }]) },
        $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
      } as any;
      const svc = makeWaitlistService(prisma, audit, notifications, {} as any);

      await svc.expireClosedWaitlists();

      expect(tx.enrollment.update).toHaveBeenCalledTimes(2);
      expect(tx.enrollment.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: {
          status: EnrollmentStatus.DROPPED,
          droppedAt: expect.any(Date),
          waitlistPosition: null,
        },
      });

      expect(audit.recordEvent).toHaveBeenCalledTimes(2);
      const event = audit.recordEvent.mock.calls[0][1];
      expect(event.action).toBe(AuditAction.ENROLLMENT_WAITLIST_EXPIRED);
      expect(event.actor).toEqual({ userId: null, ipAddress: null, userAgent: null });
      expect(event.metadata).toEqual({ reason: 'REGISTRATION_CLOSED' });

      expect(notifications.createInTx).toHaveBeenCalledTimes(2);
      expect(notifications.createInTx).toHaveBeenCalledWith(tx, {
        userId: 'student-1',
        type: 'WAITLIST_EXPIRED',
        title: expect.any(String),
        body: expect.any(String),
        payload: { enrollmentId: 'e1', sectionId: 'sec-1' },
      });
    });

    it('skips a section whose row disappeared before the lock was acquired', async () => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        enrollment: { findMany: jest.fn(), update: jest.fn() },
      } as any;
      const prisma = {
        enrollment: { findMany: jest.fn().mockResolvedValue([{ sectionId: 'sec-1' }]) },
        $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
      } as any;
      const svc = makeWaitlistService(prisma, audit, notifications, {} as any);

      await svc.expireClosedWaitlists();

      expect(tx.enrollment.findMany).not.toHaveBeenCalled();
      expect(audit.recordEvent).not.toHaveBeenCalled();
    });
  });
});
