import { EnrollmentStatus } from '@prisma/client';

import { AuditService } from '../src/audit/audit.service';
import { stubMetrics } from '../src/common/metrics.stub';
import { EnrollmentService } from '../src/enrollment/enrollment.service';
import { WaitlistService } from '../src/waitlist/waitlist.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  dockerAvailable,
  seedFixture,
  startPostgres,
  type Harness,
} from './postgres-harness';

/**
 * Concurrency invariants, against a real Postgres.
 *
 * These are the tests the unit suite structurally cannot write. Every
 * assertion here is about what happens when two transactions race for
 * the same row, which a mocked Prisma client answers by construction.
 */
const describeIfDocker = dockerAvailable() ? describe : describe.skip;

describeIfDocker('enrollment engine (real Postgres)', () => {
  let harness: Harness;
  let prisma: PrismaService;
  let enrollment: EnrollmentService;
  let waitlist: WaitlistService;

  const actor = { userId: 'system', ipAddress: null, userAgent: null };

  beforeAll(async () => {
    harness = await startPostgres();
    prisma = harness.prisma as unknown as PrismaService;

    const audit = new AuditService();
    const notifications = new NotificationsService(prisma);
    const queue = { add: jest.fn().mockResolvedValue(undefined) } as never;
    waitlist = new WaitlistService(
      prisma,
      audit,
      notifications,
      stubMetrics(),
      { enabled: true } as never,
      queue,
    );
    enrollment = new EnrollmentService(prisma, audit, waitlist, stubMetrics());
  }, 180_000);

  afterAll(async () => {
    await harness?.stop();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  it('gives the last seat to exactly one of N simultaneous students', async () => {
    const contenders = 12;
    const fx = await seedFixture(prisma, { capacity: 1, students: contenders });

    const results = await Promise.allSettled(
      fx.studentIds.map((studentId) =>
        enrollment.enroll({ sectionId: fx.sectionId }, studentId, {
          ...actor,
          userId: studentId,
        }),
      ),
    );

    const settled = results
      .filter(
        (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof enrollment.enroll>>> =>
          r.status === 'fulfilled',
      )
      .map((r) => r.value);

    expect(settled.filter((r) => r.status === EnrollmentStatus.ENROLLED)).toHaveLength(1);
    expect(settled.filter((r) => r.status === EnrollmentStatus.WAITLISTED)).toHaveLength(
      contenders - 1,
    );

    const section = await prisma.section.findUniqueOrThrow({
      where: { id: fx.sectionId },
    });
    expect(section.enrolledCount).toBe(section.capacity);
  });

  it('never lets the counter exceed capacity, whatever the interleaving', async () => {
    const fx = await seedFixture(prisma, { capacity: 5, students: 40 });

    await Promise.allSettled(
      fx.studentIds.map((studentId) =>
        enrollment.enroll({ sectionId: fx.sectionId }, studentId, {
          ...actor,
          userId: studentId,
        }),
      ),
    );

    const section = await prisma.section.findUniqueOrThrow({
      where: { id: fx.sectionId },
    });
    const enrolled = await prisma.enrollment.count({
      where: { sectionId: fx.sectionId, status: EnrollmentStatus.ENROLLED },
    });

    expect(section.enrolledCount).toBe(5);
    expect(enrolled).toBe(5);
  });

  it('decrements the counter exactly once when one enrollment is dropped twice concurrently', async () => {
    const fx = await seedFixture(prisma, { capacity: 10, students: 1 });
    const [studentId] = fx.studentIds;
    const created = await enrollment.enroll({ sectionId: fx.sectionId }, studentId, {
      ...actor,
      userId: studentId,
    });

    const before = await prisma.section.findUniqueOrThrow({
      where: { id: fx.sectionId },
    });
    expect(before.enrolledCount).toBe(1);

    // The §2.1 regression. Both transactions read ENROLLED before either
    // took the lock; without the conditional transition both decrement.
    const outcomes = await Promise.allSettled([
      enrollment.drop(created.id, studentId, { ...actor, userId: studentId }),
      enrollment.drop(created.id, studentId, { ...actor, userId: studentId }),
    ]);

    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);

    const after = await prisma.section.findUniqueOrThrow({ where: { id: fx.sectionId } });
    expect(after.enrolledCount).toBe(0);

    // And exactly one audit row, not two.
    const dropRows = await prisma.auditOutbox.count({
      where: { action: 'ENROLLMENT_DROPPED', targetId: created.id },
    });
    expect(dropRows).toBe(1);
  });

  it('writes one audit row when two requests race to leave the same waitlist', async () => {
    const fx = await seedFixture(prisma, { capacity: 1, students: 2 });
    const [first, second] = fx.studentIds;
    await enrollment.enroll({ sectionId: fx.sectionId }, first, {
      ...actor,
      userId: first,
    });
    const waiting = await enrollment.enroll({ sectionId: fx.sectionId }, second, {
      ...actor,
      userId: second,
    });
    expect(waiting.status).toBe(EnrollmentStatus.WAITLISTED);

    await Promise.allSettled([
      enrollment.drop(waiting.id, second, { ...actor, userId: second }),
      enrollment.drop(waiting.id, second, { ...actor, userId: second }),
    ]);

    const leftRows = await prisma.auditOutbox.count({
      where: { action: 'ENROLLMENT_WAITLIST_LEFT', targetId: waiting.id },
    });
    expect(leftRows).toBe(1);

    const section = await prisma.section.findUniqueOrThrow({
      where: { id: fx.sectionId },
    });
    expect(section.enrolledCount).toBe(1);
  });

  it('promotes the head of the waitlist into a freed seat, with notification and audit', async () => {
    const fx = await seedFixture(prisma, { capacity: 1, students: 3 });
    const [holder, next, later] = fx.studentIds;

    const held = await enrollment.enroll({ sectionId: fx.sectionId }, holder, {
      ...actor,
      userId: holder,
    });
    await enrollment.enroll({ sectionId: fx.sectionId }, next, {
      ...actor,
      userId: next,
    });
    await enrollment.enroll({ sectionId: fx.sectionId }, later, {
      ...actor,
      userId: later,
    });

    await enrollment.drop(held.id, holder, { ...actor, userId: holder });
    await waitlist.runPromotion(fx.sectionId);

    const promoted = await prisma.enrollment.findFirstOrThrow({
      where: { sectionId: fx.sectionId, studentId: next },
    });
    expect(promoted.status).toBe(EnrollmentStatus.ENROLLED);
    expect(promoted.waitlistPosition).toBeNull();

    const stillWaiting = await prisma.enrollment.findFirstOrThrow({
      where: { sectionId: fx.sectionId, studentId: later },
    });
    expect(stillWaiting.status).toBe(EnrollmentStatus.WAITLISTED);

    const section = await prisma.section.findUniqueOrThrow({
      where: { id: fx.sectionId },
    });
    expect(section.enrolledCount).toBe(1);

    // Notification and audit row commit in the promotion's transaction.
    await expect(
      prisma.notification.count({ where: { userId: next, type: 'WAITLIST_PROMOTED' } }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditOutbox.count({
        where: { action: 'ENROLLMENT_PROMOTED', targetId: promoted.id },
      }),
    ).resolves.toBe(1);
  });

  it('rejects a reorder that raced a concurrent join', async () => {
    const fx = await seedFixture(prisma, { capacity: 1, students: 4 });
    const [holder, a, b, latecomer] = fx.studentIds;

    await enrollment.enroll({ sectionId: fx.sectionId }, holder, {
      ...actor,
      userId: holder,
    });
    const first = await enrollment.enroll({ sectionId: fx.sectionId }, a, {
      ...actor,
      userId: a,
    });
    const secondEntry = await enrollment.enroll({ sectionId: fx.sectionId }, b, {
      ...actor,
      userId: b,
    });

    // The admin loaded the list, then somebody else joined.
    const staleOrder = [secondEntry.id, first.id];
    await enrollment.enroll({ sectionId: fx.sectionId }, latecomer, {
      ...actor,
      userId: latecomer,
    });

    await expect(
      waitlist.reorder(fx.sectionId, staleOrder, { ...actor, userId: 'admin' }),
    ).rejects.toMatchObject({ response: { code: 'WAITLIST_CHANGED' } });
  });

  it('lets the database refuse a counter that would exceed capacity', async () => {
    const fx = await seedFixture(prisma, { capacity: 1, students: 1 });

    // Bypassing the service entirely: the CHECK constraint is a
    // guarantee about the data, not about this codebase.
    await expect(
      prisma.section.update({
        where: { id: fx.sectionId },
        data: { enrolledCount: 2 },
      }),
    ).rejects.toThrow();
  });

  it('lets the database refuse a second active row for one student and section', async () => {
    const fx = await seedFixture(prisma, { capacity: 10, students: 1 });
    const [studentId] = fx.studentIds;

    await prisma.enrollment.create({
      data: { studentId, sectionId: fx.sectionId, status: EnrollmentStatus.ENROLLED },
    });

    await expect(
      prisma.enrollment.create({
        data: { studentId, sectionId: fx.sectionId, status: EnrollmentStatus.WAITLISTED },
      }),
    ).rejects.toThrow();
  });
});
