import { EnrollmentStatus } from '@prisma/client';

import { EnrollmentService } from './enrollment.service';

describe('EnrollmentService', () => {
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
