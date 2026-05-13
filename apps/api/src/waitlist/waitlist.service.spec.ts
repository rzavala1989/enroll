import { EnrollmentStatus } from '@prisma/client';
import { AuditAction } from '@enroll/shared';

import { WaitlistService } from './waitlist.service';

describe('WaitlistService', () => {
  describe('assignPosition', () => {
    it('returns 1 for an empty waitlist', async () => {
      const tx = { enrollment: { aggregate: jest.fn().mockResolvedValue({ _max: { waitlistPosition: null } }) } } as any;
      const svc = new WaitlistService({} as any, {} as any, {} as any);
      await expect(svc.assignPosition(tx, 'sec-1')).resolves.toBe(1);
      expect(tx.enrollment.aggregate).toHaveBeenCalledWith({
        where: { sectionId: 'sec-1', status: EnrollmentStatus.WAITLISTED },
        _max: { waitlistPosition: true },
      });
    });

    it('returns the current max plus one when the waitlist is non-empty', async () => {
      const tx = { enrollment: { aggregate: jest.fn().mockResolvedValue({ _max: { waitlistPosition: 7 } }) } } as any;
      const svc = new WaitlistService({} as any, {} as any, {} as any);
      await expect(svc.assignPosition(tx, 'sec-1')).resolves.toBe(8);
    });
  });

  describe('computeRank', () => {
    it('counts WAITLISTED rows with position at or below the given position', async () => {
      const db = { enrollment: { count: jest.fn().mockResolvedValue(2) } } as any;
      const svc = new WaitlistService({} as any, {} as any, {} as any);
      await expect(svc.computeRank(db, 'sec-1', 5)).resolves.toBe(2);
      expect(db.enrollment.count).toHaveBeenCalledWith({
        where: { sectionId: 'sec-1', status: EnrollmentStatus.WAITLISTED, waitlistPosition: { lte: 5 } },
      });
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
          { capacity: opts.capacity, enrolledCount: opts.enrolledCount, registrationCloses: opts.registrationCloses },
        ]),
        enrollment: {
          findFirst: jest.fn().mockImplementation(async () => (queue[0] ? { ...queue[0], sectionId: 'sec-1' } : null)),
          update: jest.fn().mockImplementation(async ({ where }: any) => {
            const idx = queue.findIndex((q) => q.id === where.id);
            queue.splice(idx, 1);
            return { id: where.id, sectionId: 'sec-1', status: EnrollmentStatus.ENROLLED };
          }),
        },
        section: { update: jest.fn().mockResolvedValue({}) },
        _queueRemaining: () => queue,
      } as any;
    }

    function makePrisma(tx: any) {
      return { $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)) } as any;
    }

    const audit = { recordEvent: jest.fn().mockResolvedValue(undefined) } as any;
    const future = new Date(Date.now() + 86_400_000);
    const past = new Date(Date.now() - 86_400_000);

    beforeEach(() => audit.recordEvent.mockClear());

    it('fills all open seats in position order', async () => {
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
      const svc = new WaitlistService(makePrisma(tx), audit, {} as any);
      await svc.runPromotion('sec-1');
      expect(tx.enrollment.update).toHaveBeenCalledTimes(2); // 2 open seats
      expect(tx.section.update).toHaveBeenCalledWith({ where: { id: 'sec-1' }, data: { enrolledCount: 3 } });
      expect(audit.recordEvent).toHaveBeenCalledTimes(2);
      expect(audit.recordEvent.mock.calls[0][1].action).toBe(AuditAction.ENROLLMENT_PROMOTED);
      expect(tx._queueRemaining().map((q: any) => q.id)).toEqual(['e3']);
    });

    it('does nothing when there are no open seats', async () => {
      const tx = makeTx({ capacity: 2, enrolledCount: 2, registrationCloses: future, waitlist: [{ id: 'e1', waitlistPosition: 1 }] });
      const svc = new WaitlistService(makePrisma(tx), audit, {} as any);
      await svc.runPromotion('sec-1');
      expect(tx.enrollment.update).not.toHaveBeenCalled();
      expect(tx.section.update).not.toHaveBeenCalled();
      expect(audit.recordEvent).not.toHaveBeenCalled();
    });

    it('does nothing when registration has closed', async () => {
      const tx = makeTx({ capacity: 5, enrolledCount: 0, registrationCloses: past, waitlist: [{ id: 'e1', waitlistPosition: 1 }] });
      const svc = new WaitlistService(makePrisma(tx), audit, {} as any);
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
      const svc = new WaitlistService(makePrisma(tx), audit, {} as any);
      await svc.runPromotion('sec-1');
      expect(tx.enrollment.update).toHaveBeenCalledTimes(2);
      expect(tx.section.update).toHaveBeenCalledWith({ where: { id: 'sec-1' }, data: { enrolledCount: 2 } });
    });
  });
});
