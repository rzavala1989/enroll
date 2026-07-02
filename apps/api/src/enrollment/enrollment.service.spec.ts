import { ConflictException } from '@nestjs/common';
import { EnrollmentStatus } from '@prisma/client';

import { EnrollmentService } from './enrollment.service';

describe('EnrollmentService', () => {
  describe('enroll (waitlist cap)', () => {
    const past = new Date(Date.now() - 86_400_000);
    const future = new Date(Date.now() + 86_400_000);

    function makeTx(opts: { waitlistCap: number | null; waiting: number }) {
      return {
        section: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'sec-1',
            capacity: 20,
            enrolledCount: 20,
            term: { registrationOpens: past, registrationCloses: future },
          }),
        },
        user: { findUnique: jest.fn().mockResolvedValue({ id: 'stu-1' }) },
        $queryRaw: jest.fn().mockResolvedValue([
          { id: 'sec-1', capacity: 20, enrolledCount: 20, waitlistCap: opts.waitlistCap },
        ]),
        enrollment: {
          findFirst: jest.fn().mockResolvedValue(null),
          count: jest.fn().mockResolvedValue(opts.waiting),
          create: jest.fn().mockResolvedValue({
            id: 'enr-1',
            studentId: 'stu-1',
            sectionId: 'sec-1',
            status: EnrollmentStatus.WAITLISTED,
            enrolledAt: new Date('2026-07-01T10:00:00Z'),
          }),
        },
      } as any;
    }

    function makeService(tx: any) {
      const prisma = {
        $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
      } as any;
      const audit = { recordEvent: jest.fn().mockResolvedValue(undefined) } as any;
      const waitlist = {
        assignPosition: jest.fn().mockResolvedValue(6),
        computeRank: jest.fn().mockResolvedValue(6),
      } as any;
      return new EnrollmentService(prisma, audit, waitlist);
    }

    const actor = { userId: 'stu-1', ipAddress: null, userAgent: null };

    it('waitlists when the cap has room', async () => {
      const tx = makeTx({ waitlistCap: 10, waiting: 5 });
      const svc = makeService(tx);

      const result = await svc.enroll({ sectionId: 'sec-1' }, 'stu-1', actor);

      expect(result.status).toBe(EnrollmentStatus.WAITLISTED);
      expect(result.waitlistPosition).toBe(6);
      expect(tx.enrollment.create).toHaveBeenCalled();
    });

    it('throws 409 SECTION_FULL when the waitlist is at its cap', async () => {
      const tx = makeTx({ waitlistCap: 5, waiting: 5 });
      const svc = makeService(tx);

      const attempt = svc.enroll({ sectionId: 'sec-1' }, 'stu-1', actor);
      await expect(attempt).rejects.toBeInstanceOf(ConflictException);
      await expect(attempt).rejects.toMatchObject({ response: { code: 'SECTION_FULL' } });
      expect(tx.enrollment.create).not.toHaveBeenCalled();
    });

    it('never caps an unlimited (null) waitlist', async () => {
      const tx = makeTx({ waitlistCap: null, waiting: 500 });
      const svc = makeService(tx);

      const result = await svc.enroll({ sectionId: 'sec-1' }, 'stu-1', actor);

      expect(result.status).toBe(EnrollmentStatus.WAITLISTED);
      expect(tx.enrollment.count).not.toHaveBeenCalled();
    });

    it('treats waitlistCap 0 as waitlist disabled', async () => {
      const tx = makeTx({ waitlistCap: 0, waiting: 0 });
      const svc = makeService(tx);

      await expect(
        svc.enroll({ sectionId: 'sec-1' }, 'stu-1', actor),
      ).rejects.toMatchObject({ response: { code: 'SECTION_FULL' } });
    });
  });

  describe('listMine', () => {
    const section = {
      id: 'sec-1',
      sectionNumber: '001',
      instructorName: 'Grace Hopper',
      meetingPattern: 'MWF 9:00-9:50',
      room: 'WCH 101',
      course: { id: 'crs-1', code: 'CS101', title: 'Intro to CS', credits: 4 },
    };

    it('maps rows and computes a dense rank for waitlisted ones', async () => {
      const rows = [
        {
          id: 'e1',
          status: EnrollmentStatus.WAITLISTED,
          enrolledAt: new Date('2026-06-01T10:00:00Z'),
          waitlistPosition: 7,
          section,
        },
        {
          id: 'e2',
          status: EnrollmentStatus.ENROLLED,
          enrolledAt: new Date('2026-05-01T10:00:00Z'),
          waitlistPosition: null,
          section,
        },
      ];
      const prisma = {
        enrollment: { findMany: jest.fn().mockResolvedValue(rows) },
      } as any;
      const waitlist = { computeRank: jest.fn().mockResolvedValue(3) } as any;
      const svc = new EnrollmentService(prisma, {} as any, waitlist);

      const result = await svc.listMine('stu-1');

      expect(prisma.enrollment.findMany).toHaveBeenCalledWith({
        where: { studentId: 'stu-1' },
        orderBy: { enrolledAt: 'desc' },
        select: {
          id: true,
          status: true,
          enrolledAt: true,
          waitlistPosition: true,
          section: {
            select: {
              id: true,
              sectionNumber: true,
              instructorName: true,
              meetingPattern: true,
              room: true,
              course: { select: { id: true, code: true, title: true, credits: true } },
            },
          },
        },
      });
      expect(waitlist.computeRank).toHaveBeenCalledWith(prisma, 'sec-1', 7);
      expect(result).toEqual([
        {
          id: 'e1',
          status: EnrollmentStatus.WAITLISTED,
          enrolledAt: '2026-06-01T10:00:00.000Z',
          waitlistPosition: 3,
          section: {
            id: 'sec-1',
            sectionNumber: '001',
            instructorName: 'Grace Hopper',
            meetingPattern: 'MWF 9:00-9:50',
            room: 'WCH 101',
          },
          course: { id: 'crs-1', code: 'CS101', title: 'Intro to CS', credits: 4 },
        },
        {
          id: 'e2',
          status: EnrollmentStatus.ENROLLED,
          enrolledAt: '2026-05-01T10:00:00.000Z',
          waitlistPosition: undefined,
          section: {
            id: 'sec-1',
            sectionNumber: '001',
            instructorName: 'Grace Hopper',
            meetingPattern: 'MWF 9:00-9:50',
            room: 'WCH 101',
          },
          course: { id: 'crs-1', code: 'CS101', title: 'Intro to CS', credits: 4 },
        },
      ]);
    });

    it('returns an empty array for a student with no enrollments', async () => {
      const prisma = {
        enrollment: { findMany: jest.fn().mockResolvedValue([]) },
      } as any;
      const svc = new EnrollmentService(prisma, {} as any, {} as any);

      await expect(svc.listMine('stu-2')).resolves.toEqual([]);
    });
  });
});
