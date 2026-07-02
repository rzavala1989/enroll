import { NotFoundException } from '@nestjs/common';
import { EnrollmentStatus } from '@prisma/client';

import { CoursesService } from './courses.service';

function section(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    sectionNumber: '001',
    instructorName: 'Prof. Ada',
    meetingPattern: 'MWF 9:00-9:50',
    room: 'Olmsted 1129',
    capacity: 20,
    enrolledCount: 20,
    waitlistCap: null,
    ...overrides,
  };
}

function makePrisma(opts: {
  sections: ReturnType<typeof section>[];
  waitlistGroups?: Array<{ sectionId: string; _count: { _all: number } }>;
  viewerRows?: Array<{
    id: string;
    sectionId: string;
    status: EnrollmentStatus;
    waitlistPosition: number | null;
  }>;
}) {
  return {
    course: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'course-1',
        code: 'CS101',
        title: 'Intro',
        description: null,
        credits: 4,
        sections: opts.sections,
      }),
    },
    enrollment: {
      groupBy: jest.fn().mockResolvedValue(opts.waitlistGroups ?? []),
      findMany: jest.fn().mockResolvedValue(opts.viewerRows ?? []),
    },
  } as any;
}

describe('CoursesService.getCourse', () => {
  const waitlist = { computeRank: jest.fn() } as any;

  beforeEach(() => waitlist.computeRank.mockReset());

  it('throws NotFoundException when the course does not exist', async () => {
    const prisma = { course: { findUnique: jest.fn().mockResolvedValue(null) } } as any;
    const svc = new CoursesService(prisma, waitlist);
    await expect(svc.getCourse('missing', undefined, 'term-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('adds waitlist counts and omits viewerEnrollment for non-student viewers', async () => {
    const prisma = makePrisma({
      sections: [section('sec-1', { waitlistCap: 5 }), section('sec-2')],
      waitlistGroups: [{ sectionId: 'sec-1', _count: { _all: 3 } }],
    });
    const svc = new CoursesService(prisma, waitlist);

    const detail = await svc.getCourse(
      'course-1',
      { userId: 'staff-1', isStudent: false },
      'term-1',
    );

    expect(detail.sections[0].waitlistCount).toBe(3);
    expect(detail.sections[0].waitlistCap).toBe(5);
    expect(detail.sections[1].waitlistCount).toBe(0);
    expect(detail.sections[1].waitlistCap).toBeNull();
    expect('viewerEnrollment' in detail.sections[0]).toBe(false);
    expect(prisma.enrollment.findMany).not.toHaveBeenCalled();
  });

  it('resolves the student standing per section with rank for waitlisted rows', async () => {
    const prisma = makePrisma({
      sections: [section('sec-1'), section('sec-2'), section('sec-3')],
      viewerRows: [
        { id: 'e-1', sectionId: 'sec-1', status: EnrollmentStatus.ENROLLED, waitlistPosition: null },
        { id: 'e-2', sectionId: 'sec-2', status: EnrollmentStatus.WAITLISTED, waitlistPosition: 4 },
      ],
    });
    waitlist.computeRank.mockResolvedValue(2);
    const svc = new CoursesService(prisma, waitlist);

    const detail = await svc.getCourse(
      'course-1',
      { userId: 'student-1', isStudent: true },
      'term-1',
    );

    expect(detail.sections[0].viewerEnrollment).toEqual({
      enrollmentId: 'e-1',
      status: 'ENROLLED',
      waitlistPosition: undefined,
    });
    expect(detail.sections[1].viewerEnrollment).toEqual({
      enrollmentId: 'e-2',
      status: 'WAITLISTED',
      waitlistPosition: 2,
    });
    expect(detail.sections[2].viewerEnrollment).toBeNull();
    expect(waitlist.computeRank).toHaveBeenCalledWith(prisma, 'sec-2', 4);
    expect(prisma.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          studentId: 'student-1',
          status: { in: [EnrollmentStatus.ENROLLED, EnrollmentStatus.WAITLISTED, EnrollmentStatus.COMPLETED] },
        }),
      }),
    );
  });

  it('prefers ENROLLED over COMPLETED when a student has both rows for a section', async () => {
    const prisma = makePrisma({
      sections: [section('sec-1')],
      viewerRows: [
        { id: 'e-old', sectionId: 'sec-1', status: EnrollmentStatus.COMPLETED, waitlistPosition: null },
        { id: 'e-new', sectionId: 'sec-1', status: EnrollmentStatus.ENROLLED, waitlistPosition: null },
      ],
    });
    const svc = new CoursesService(prisma, waitlist);

    const detail = await svc.getCourse(
      'course-1',
      { userId: 'student-1', isStudent: true },
      'term-1',
    );

    expect(detail.sections[0].viewerEnrollment?.enrollmentId).toBe('e-new');
    expect(detail.sections[0].viewerEnrollment?.status).toBe('ENROLLED');
  });
});
