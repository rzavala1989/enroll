import { BadRequestException, ConflictException } from '@nestjs/common';
import { EnrollmentStatus } from '@prisma/client';

import { EnrollmentService } from './enrollment.service';

import { stubMetrics } from '../common/metrics.stub';

function makeEnrollmentService(
  prisma: any,
  audit: any,
  waitlist: any,
): EnrollmentService {
  return new EnrollmentService(prisma, audit, waitlist, stubMetrics());
}

describe('EnrollmentService', () => {
  describe('enroll (waitlist cap)', () => {
    const past = new Date(Date.now() - 86_400_000);
    const future = new Date(Date.now() + 86_400_000);

    function makeTx(opts: { waitlistCap: number | null; waiting: number }) {
      return {
        section: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'sec-1',
            courseId: 'crs-1',
            termId: 'term-1',
            meetingPattern: 'MWF 9:00-9:50',
            capacity: 20,
            enrolledCount: 20,
            term: { registrationOpens: past, registrationCloses: future },
          }),
        },
        user: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 'stu-1', classStanding: 'SENIOR' }),
        },
        $queryRaw: jest.fn().mockResolvedValue([
          {
            id: 'sec-1',
            capacity: 20,
            enrolledCount: 20,
            waitlistCap: opts.waitlistCap,
          },
        ]),
        enrollment: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(opts.waiting),
          create: jest.fn().mockResolvedValue({
            id: 'enr-1',
            studentId: 'stu-1',
            sectionId: 'sec-1',
            status: EnrollmentStatus.WAITLISTED,
            enrolledAt: new Date('2026-07-01T10:00:00Z'),
          }),
        },
        coursePrerequisite: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        registrationWindow: {
          findUnique: jest.fn().mockResolvedValue(null),
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
      return makeEnrollmentService(prisma, audit, waitlist);
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

    it('converges on the existing row when a student re-sends an enroll they already hold', async () => {
      const tx = makeTx({ waitlistCap: 10, waiting: 5 });
      tx.enrollment.findFirst.mockResolvedValue({
        id: 'enr-existing',
        studentId: 'stu-1',
        sectionId: 'sec-1',
        status: EnrollmentStatus.ENROLLED,
        enrolledAt: new Date('2026-07-01T09:00:00Z'),
        waitlistPosition: null,
      });
      const svc = makeService(tx);

      // Registration-day clients retry. Answering 409 to a request whose
      // desired state already holds is a support ticket, not a guard.
      const result = await svc.enroll({ sectionId: 'sec-1' }, 'stu-1', actor);

      expect(result.id).toBe('enr-existing');
      expect(result.status).toBe(EnrollmentStatus.ENROLLED);
      expect(tx.enrollment.create).not.toHaveBeenCalled();
    });

    it('reports the live rank when re-sending a waitlist join', async () => {
      const tx = makeTx({ waitlistCap: 10, waiting: 5 });
      tx.enrollment.findFirst.mockResolvedValue({
        id: 'enr-existing',
        studentId: 'stu-1',
        sectionId: 'sec-1',
        status: EnrollmentStatus.WAITLISTED,
        enrolledAt: new Date('2026-07-01T09:00:00Z'),
        waitlistPosition: 12,
      });
      const svc = makeService(tx);

      const result = await svc.enroll({ sectionId: 'sec-1' }, 'stu-1', actor);

      expect(result.status).toBe(EnrollmentStatus.WAITLISTED);
      expect(result.waitlistPosition).toBe(6);
      expect(tx.enrollment.create).not.toHaveBeenCalled();
    });

    it('treats waitlistCap 0 as waitlist disabled', async () => {
      const tx = makeTx({ waitlistCap: 0, waiting: 0 });
      const svc = makeService(tx);

      await expect(
        svc.enroll({ sectionId: 'sec-1' }, 'stu-1', actor),
      ).rejects.toMatchObject({ response: { code: 'SECTION_FULL' } });
    });
  });

  describe('enroll (eligibility checks)', () => {
    const past = new Date(Date.now() - 86_400_000);
    const future = new Date(Date.now() + 86_400_000);
    const actor = { userId: 'stu-1', ipAddress: null, userAgent: null };

    function baseTx() {
      return {
        section: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'sec-1',
            courseId: 'crs-1',
            termId: 'term-1',
            meetingPattern: 'MWF 9:00-9:50',
            capacity: 30,
            enrolledCount: 10,
            term: { registrationOpens: past, registrationCloses: future },
          }),
          update: jest.fn().mockResolvedValue({ capacity: 30, enrolledCount: 11 }),
        },
        user: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 'stu-1', classStanding: 'SENIOR' }),
        },
        $queryRaw: jest
          .fn()
          .mockResolvedValue([
            { id: 'sec-1', capacity: 30, enrolledCount: 10, waitlistCap: null },
          ]),
        enrollment: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockResolvedValue({
            id: 'enr-new',
            studentId: 'stu-1',
            sectionId: 'sec-1',
            status: EnrollmentStatus.ENROLLED,
            enrolledAt: new Date('2026-08-01T10:00:00Z'),
          }),
        },
        coursePrerequisite: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        registrationWindow: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      } as any;
    }

    function buildService(tx: any) {
      const prisma = {
        $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
      } as any;
      const audit = { recordEvent: jest.fn().mockResolvedValue(undefined) } as any;
      const waitlist = {
        assignPosition: jest.fn().mockResolvedValue(1),
        computeRank: jest.fn().mockResolvedValue(1),
      } as any;
      return makeEnrollmentService(prisma, audit, waitlist);
    }

    it('rejects when the student is already active in another section of the same course', async () => {
      const tx = baseTx();
      // First findFirst: active-row check (same section) => null
      // Second findFirst: same-course check => found
      tx.enrollment.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'enr-dup' });
      const svc = buildService(tx);

      await expect(
        svc.enroll({ sectionId: 'sec-1' }, 'stu-1', actor),
      ).rejects.toMatchObject({ response: { code: 'DUPLICATE_COURSE' } });
      expect(tx.enrollment.create).not.toHaveBeenCalled();
    });

    it('rejects when prerequisites are not met', async () => {
      const tx = baseTx();
      tx.coursePrerequisite.findMany.mockResolvedValue([
        { prerequisiteId: 'crs-prereq-1' },
      ]);
      // enrollment.findMany calls:
      //   1st: prereq check (COMPLETED enrollments) => empty
      //   2nd: time-conflict check => never reached
      tx.enrollment.findMany.mockResolvedValueOnce([]);
      const svc = buildService(tx);

      await expect(
        svc.enroll({ sectionId: 'sec-1' }, 'stu-1', actor),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        svc.enroll({ sectionId: 'sec-1' }, 'stu-1', actor),
      ).rejects.toMatchObject({ response: { code: 'PREREQUISITE_NOT_MET' } });
      expect(tx.enrollment.create).not.toHaveBeenCalled();
    });

    it('passes the prereq gate when the student has completed the prerequisite', async () => {
      const tx = baseTx();
      tx.coursePrerequisite.findMany.mockResolvedValue([
        { prerequisiteId: 'crs-prereq-1' },
      ]);
      // enrollment.findMany calls:
      //   1st: prereq check => student has completed the prereq
      //   2nd: time-conflict check => no conflicts
      tx.enrollment.findMany
        .mockResolvedValueOnce([{ section: { courseId: 'crs-prereq-1' } }])
        .mockResolvedValueOnce([]);
      const svc = buildService(tx);

      const result = await svc.enroll({ sectionId: 'sec-1' }, 'stu-1', actor);

      expect(result.status).toBe(EnrollmentStatus.ENROLLED);
    });

    it('rejects when the target section conflicts with an existing enrollment', async () => {
      const tx = baseTx();
      // enrollment.findMany calls:
      //   1st: prereq check => no prereqs, so this is skipped... wait,
      //        prereqs is empty so findMany for completed is never called.
      //        The first findMany call is the time-conflict check.
      tx.enrollment.findMany.mockResolvedValue([
        {
          sectionId: 'sec-other',
          section: {
            meetingPattern: 'MWF 9:00-9:50',
            sectionNumber: '002',
            course: { code: 'CS201' },
          },
        },
      ]);
      const svc = buildService(tx);

      await expect(
        svc.enroll({ sectionId: 'sec-1' }, 'stu-1', actor),
      ).rejects.toMatchObject({ response: { code: 'TIME_CONFLICT' } });
      expect(tx.enrollment.create).not.toHaveBeenCalled();
    });

    it('allows enrollment when meeting patterns do not overlap', async () => {
      const tx = baseTx();
      tx.enrollment.findMany.mockResolvedValue([
        {
          sectionId: 'sec-other',
          section: {
            meetingPattern: 'TR 1:30-2:45',
            sectionNumber: '001',
            course: { code: 'CS201' },
          },
        },
      ]);
      const svc = buildService(tx);

      const result = await svc.enroll({ sectionId: 'sec-1' }, 'stu-1', actor);

      expect(result.status).toBe(EnrollmentStatus.ENROLLED);
    });

    it('rejects when the standing-specific window has not opened yet', async () => {
      const tx = baseTx();
      const tomorrow = new Date(Date.now() + 86_400_000);
      tx.registrationWindow.findUnique.mockResolvedValue({
        opensAt: tomorrow,
      });
      const svc = buildService(tx);

      await expect(
        svc.enroll({ sectionId: 'sec-1' }, 'stu-1', actor),
      ).rejects.toMatchObject({ response: { code: 'REGISTRATION_NOT_OPEN' } });
      expect(tx.enrollment.create).not.toHaveBeenCalled();
    });

    it('allows enrollment when the standing-specific window is open', async () => {
      const tx = baseTx();
      const yesterday = new Date(Date.now() - 86_400_000);
      tx.registrationWindow.findUnique.mockResolvedValue({
        opensAt: yesterday,
      });
      const svc = buildService(tx);

      const result = await svc.enroll({ sectionId: 'sec-1' }, 'stu-1', actor);

      expect(result.status).toBe(EnrollmentStatus.ENROLLED);
    });

    it('falls back to term registrationOpens when no standing window exists', async () => {
      const tx = baseTx();
      tx.registrationWindow.findUnique.mockResolvedValue(null);
      const svc = buildService(tx);

      const result = await svc.enroll({ sectionId: 'sec-1' }, 'stu-1', actor);

      expect(result.status).toBe(EnrollmentStatus.ENROLLED);
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
      const waitlist = {
        computeRanks: jest.fn().mockResolvedValue(new Map([['e1', 3]])),
      } as any;
      const svc = makeEnrollmentService(prisma, {} as any, waitlist);

      const result = await svc.listMine('stu-1');

      expect(prisma.enrollment.findMany).toHaveBeenCalledWith({
        where: { studentId: 'stu-1' },
        orderBy: { enrolledAt: 'desc' },
        // Bounded by default: the endpoint used to return a student's
        // whole history unpaginated.
        skip: 0,
        take: 100,
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
      // One batched window query for the whole page, not a count per row.
      expect(waitlist.computeRanks).toHaveBeenCalledTimes(1);
      expect(waitlist.computeRanks).toHaveBeenCalledWith(prisma, [
        { id: 'e1', sectionId: 'sec-1', waitlistPosition: 7 },
      ]);
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
      const waitlist = {
        computeRanks: jest.fn().mockResolvedValue(new Map()),
      } as any;
      const svc = makeEnrollmentService(prisma, {} as any, waitlist);

      await expect(svc.listMine('stu-2')).resolves.toEqual([]);
    });
  });

  describe('drop', () => {
    const actor = { userId: 'stu-1', ipAddress: null, userAgent: null };

    /**
     * `findUnique` is called twice: once before the lock for the
     * sectionId, once after for the authoritative status. Both return
     * the same row here; `transitioned` drives the conditional update's
     * matched-row count.
     */
    function makeDropTx(opts: {
      status: EnrollmentStatus;
      transitioned?: number;
      waitlistPosition?: number | null;
    }) {
      return {
        enrollment: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'e1',
            studentId: 'stu-1',
            sectionId: 'sec-1',
            status: opts.status,
            waitlistPosition: opts.waitlistPosition ?? null,
            enrolledAt: new Date('2026-06-01T10:00:00Z'),
          }),
          updateMany: jest.fn().mockResolvedValue({ count: opts.transitioned ?? 1 }),
        },
        section: {
          update: jest.fn().mockResolvedValue({ capacity: 20, enrolledCount: 19 }),
          findUnique: jest.fn().mockResolvedValue({ capacity: 20, enrolledCount: 20 }),
        },
        $queryRaw: jest.fn().mockResolvedValue([{ id: 'sec-1' }]),
      } as any;
    }

    function makeDropService(tx: any) {
      const prisma = {
        $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
      } as any;
      const audit = { recordEvent: jest.fn().mockResolvedValue(undefined) } as any;
      const waitlist = {
        enqueuePromotion: jest.fn().mockResolvedValue(undefined),
      } as any;
      return { svc: makeEnrollmentService(prisma, audit, waitlist), audit, waitlist };
    }

    it('stamps droppedAt on an enrolled drop and frees the seat', async () => {
      const tx = makeDropTx({ status: EnrollmentStatus.ENROLLED });
      const { svc, waitlist } = makeDropService(tx);

      const result = await svc.drop('e1', 'stu-1', actor);

      expect(result.droppedAt).toEqual(expect.any(String));
      expect(result.status).toBe(EnrollmentStatus.DROPPED);
      expect(tx.section.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { enrolledCount: { decrement: 1 } } }),
      );
      expect(waitlist.enqueuePromotion).toHaveBeenCalledWith('sec-1');
    });

    it('locks the section before reading the status it acts on', async () => {
      const order: string[] = [];
      const tx = makeDropTx({ status: EnrollmentStatus.ENROLLED });
      tx.$queryRaw.mockImplementation(async () => {
        order.push('lock');
        return [{ id: 'sec-1' }];
      });
      const original = tx.enrollment.findUnique;
      tx.enrollment.findUnique = jest.fn().mockImplementation(async (args: any) => {
        order.push('read');
        return original(args);
      });
      const { svc } = makeDropService(tx);

      await svc.drop('e1', 'stu-1', actor);

      // Pre-lock read for the sectionId, then the lock, then the
      // authoritative read that the transition is based on.
      expect(order).toEqual(['read', 'lock', 'read']);
    });

    it('gates the transition on the status it read, so a racing drop cannot decrement twice', async () => {
      const tx = makeDropTx({ status: EnrollmentStatus.ENROLLED, transitioned: 0 });
      const { svc, waitlist } = makeDropService(tx);

      const attempt = svc.drop('e1', 'stu-1', actor);

      await expect(attempt).rejects.toBeInstanceOf(ConflictException);
      await expect(attempt).rejects.toMatchObject({
        response: { code: 'ALREADY_DROPPED' },
      });
      expect(tx.enrollment.updateMany).toHaveBeenCalledWith({
        where: { id: 'e1', status: EnrollmentStatus.ENROLLED },
        data: expect.objectContaining({ status: EnrollmentStatus.DROPPED }),
      });
      expect(tx.section.update).not.toHaveBeenCalled();
      expect(waitlist.enqueuePromotion).not.toHaveBeenCalled();
    });

    it('stamps droppedAt when leaving the waitlist, without freeing a seat', async () => {
      const tx = makeDropTx({
        status: EnrollmentStatus.WAITLISTED,
        waitlistPosition: 3,
      });
      const { svc, waitlist } = makeDropService(tx);

      const result = await svc.drop('e1', 'stu-1', actor);

      expect(result.droppedAt).toEqual(expect.any(String));
      expect(tx.section.update).not.toHaveBeenCalled();
      expect(waitlist.enqueuePromotion).not.toHaveBeenCalled();
    });

    it('writes exactly one audit row when two drops race the waitlist-leave branch', async () => {
      const tx = makeDropTx({
        status: EnrollmentStatus.WAITLISTED,
        waitlistPosition: 3,
        transitioned: 0,
      });
      const { svc, audit } = makeDropService(tx);

      await expect(svc.drop('e1', 'stu-1', actor)).rejects.toMatchObject({
        response: { code: 'ALREADY_DROPPED' },
      });
      expect(audit.recordEvent).not.toHaveBeenCalled();
    });

    it('rejects a drop of an already-terminal enrollment', async () => {
      const tx = makeDropTx({ status: EnrollmentStatus.COMPLETED });
      const { svc } = makeDropService(tx);

      await expect(svc.drop('e1', 'stu-1', actor)).rejects.toMatchObject({
        response: { code: 'ALREADY_DROPPED' },
      });
      expect(tx.enrollment.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('populates droppedAt and completedAt when present', async () => {
      const prisma = {
        enrollment: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'e1',
            studentId: 'stu-1',
            sectionId: 'sec-1',
            status: EnrollmentStatus.COMPLETED,
            enrolledAt: new Date('2026-01-01T10:00:00Z'),
            waitlistPosition: null,
            droppedAt: null,
            completedAt: new Date('2026-06-01T10:00:00Z'),
            section: { capacity: 20, enrolledCount: 18 },
          }),
        },
      } as any;
      const svc = makeEnrollmentService(prisma, {} as any, {} as any);

      const result = await svc.findOne('e1');

      expect(result.droppedAt).toBeUndefined();
      expect(result.completedAt).toBe('2026-06-01T10:00:00.000Z');
    });
  });
});
