import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuditAction } from '@enroll/shared';

import { SectionsService } from './sections.service';

/** The catalog cache is instrumentation from these specs' point of view. */
function makeSectionsService(prisma: any, audit: any, waitlist: any): SectionsService {
  const catalogCache = { invalidate: jest.fn().mockResolvedValue(undefined) } as any;
  return new SectionsService(prisma, audit, waitlist, catalogCache);
}

const ACTOR = { userId: 'admin-1', ipAddress: '127.0.0.1', userAgent: 'jest' };

function makeTx(opts: {
  locked?: { capacity: number; enrolledCount: number; waitlistCap: number | null } | null;
  waitlistCount?: number;
}) {
  return {
    $queryRaw: jest.fn().mockResolvedValue(opts.locked ? [opts.locked] : []),
    section: {
      update: jest.fn().mockImplementation(async ({ data }: any) => ({
        id: 'sec-1',
        sectionNumber: '001',
        courseId: 'course-1',
        capacity: data.capacity,
        enrolledCount: opts.locked?.enrolledCount ?? 0,
        waitlistCap: data.waitlistCap,
        course: { code: 'CS101' },
      })),
    },
    enrollment: { count: jest.fn().mockResolvedValue(opts.waitlistCount ?? 0) },
  } as any;
}

function makePrisma(tx: any) {
  return { $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)) } as any;
}

describe('SectionsService.update', () => {
  const audit = { recordEvent: jest.fn().mockResolvedValue(undefined) } as any;
  const waitlist = { enqueuePromotion: jest.fn().mockResolvedValue(undefined) } as any;

  beforeEach(() => {
    audit.recordEvent.mockClear();
    waitlist.enqueuePromotion.mockClear();
  });

  it('rejects an empty body with NO_FIELDS', async () => {
    const svc = makeSectionsService({} as any, audit, waitlist);
    await expect(svc.update('sec-1', {}, ACTOR)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('404s when the section does not exist', async () => {
    const tx = makeTx({ locked: null });
    const svc = makeSectionsService(makePrisma(tx), audit, waitlist);
    await expect(svc.update('sec-1', { capacity: 25 }, ACTOR)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects a capacity below the current enrolledCount', async () => {
    const tx = makeTx({ locked: { capacity: 20, enrolledCount: 18, waitlistCap: null } });
    const svc = makeSectionsService(makePrisma(tx), audit, waitlist);
    await expect(svc.update('sec-1', { capacity: 10 }, ACTOR)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.section.update).not.toHaveBeenCalled();
    expect(audit.recordEvent).not.toHaveBeenCalled();
  });

  it('raises capacity, audits, and enqueues the promotion sweep', async () => {
    const tx = makeTx({
      locked: { capacity: 20, enrolledCount: 20, waitlistCap: 10 },
      waitlistCount: 4,
    });
    const svc = makeSectionsService(makePrisma(tx), audit, waitlist);

    const summary = await svc.update('sec-1', { capacity: 25 }, ACTOR);

    expect(tx.section.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { capacity: 25, waitlistCap: 10 } }),
    );
    expect(summary).toMatchObject({
      capacity: 25,
      seatsAvailable: 5,
      waitlistCount: 4,
      waitlistCap: 10,
      courseCode: 'CS101',
    });
    expect(audit.recordEvent).toHaveBeenCalledTimes(1);
    const event = audit.recordEvent.mock.calls[0][1];
    expect(event.action).toBe(AuditAction.SECTION_UPDATED);
    expect(event.before).toEqual({ capacity: 20, waitlistCap: 10 });
    expect(event.after).toEqual({ capacity: 25, waitlistCap: 10 });
    expect(waitlist.enqueuePromotion).toHaveBeenCalledWith('sec-1');
  });

  it('does not enqueue promotion when capacity stays or drops', async () => {
    const tx = makeTx({ locked: { capacity: 20, enrolledCount: 10, waitlistCap: null } });
    const svc = makeSectionsService(makePrisma(tx), audit, waitlist);

    await svc.update('sec-1', { capacity: 15 }, ACTOR);
    await svc.update('sec-1', { waitlistCap: 3 }, ACTOR);

    expect(waitlist.enqueuePromotion).not.toHaveBeenCalled();
  });

  it('clears the waitlist cap back to unlimited with an explicit null', async () => {
    const tx = makeTx({ locked: { capacity: 20, enrolledCount: 10, waitlistCap: 5 } });
    const svc = makeSectionsService(makePrisma(tx), audit, waitlist);

    const summary = await svc.update('sec-1', { waitlistCap: null }, ACTOR);

    expect(tx.section.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { capacity: 20, waitlistCap: null } }),
    );
    expect(summary.waitlistCap).toBeNull();
  });
});

describe('SectionsService.getSummary', () => {
  it('404s when the section does not exist', async () => {
    const prisma = { section: { findUnique: jest.fn().mockResolvedValue(null) } } as any;
    const svc = makeSectionsService(prisma, {} as any, {} as any);
    await expect(svc.getSummary('sec-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the summary with the live waitlist count', async () => {
    const prisma = {
      section: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'sec-1',
          sectionNumber: '001',
          courseId: 'course-1',
          capacity: 20,
          enrolledCount: 18,
          waitlistCap: 5,
          course: { code: 'CS101' },
        }),
      },
      enrollment: { count: jest.fn().mockResolvedValue(2) },
    } as any;
    const svc = makeSectionsService(prisma, {} as any, {} as any);

    await expect(svc.getSummary('sec-1')).resolves.toEqual({
      id: 'sec-1',
      sectionNumber: '001',
      courseId: 'course-1',
      courseCode: 'CS101',
      capacity: 20,
      enrolledCount: 18,
      seatsAvailable: 2,
      waitlistCount: 2,
      waitlistCap: 5,
    });
  });
});
