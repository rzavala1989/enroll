import { InjectQueue } from '@nestjs/bullmq';
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EnrollmentStatus, Prisma } from '@prisma/client';
import { AuditAction } from '@enroll/shared';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Queue } from 'bullmq';

import { AuditService } from '../audit/audit.service';
import { MetricsService } from '../common/metrics.service';
import type { RequestActor } from '../common/request-actor';
import { SchedulerGate } from '../common/scheduler-gate.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { WaitlistEntryDto } from './dto/waitlist-entry.dto';

export const PROMOTE_WAITLIST_QUEUE = 'promote-waitlist';

/** Anything we can read enrollments through: the base client or a transaction client. */
type Db = Prisma.TransactionClient | PrismaService;

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly metrics: MetricsService,
    private readonly gate: SchedulerGate,
    @InjectQueue(PROMOTE_WAITLIST_QUEUE) private readonly queue: Queue,
  ) {}

  /** Next sparse waitlist position for a section: the current max position plus one, or 1 if the waitlist is empty. */
  async assignPosition(tx: Prisma.TransactionClient, sectionId: string): Promise<number> {
    const agg = await tx.enrollment.aggregate({
      where: { sectionId, status: EnrollmentStatus.WAITLISTED },
      _max: { waitlistPosition: true },
    });
    return (agg._max.waitlistPosition ?? 0) + 1;
  }

  /** 1-based dense rank of a waitlisted row among the section's current WAITLISTED rows. */
  async computeRank(
    db: Db,
    sectionId: string,
    waitlistPosition: number,
  ): Promise<number> {
    return db.enrollment.count({
      where: {
        sectionId,
        status: EnrollmentStatus.WAITLISTED,
        waitlistPosition: { lte: waitlistPosition },
      },
    });
  }

  /**
   * Dense ranks for several enrollments at once, keyed by enrollment id.
   *
   * `computeRank` costs one count query per waitlisted row, which the
   * "my enrollments" list and the course-detail viewer lookup both paid
   * in a loop. A student waitlisted for eight sections issued eight
   * extra round trips to render one page. This does it in one window
   * function over the sections involved.
   */
  async computeRanks(
    db: Db,
    rows: Array<{ id: string; sectionId: string; waitlistPosition: number }>,
  ): Promise<Map<string, number>> {
    const ranks = new Map<string, number>();
    if (rows.length === 0) return ranks;

    const sectionIds = [...new Set(rows.map((r) => r.sectionId))];
    const ranked = await db.$queryRaw<
      Array<{ sectionId: string; waitlistPosition: number; rank: bigint }>
    >`
      SELECT "sectionId",
             "waitlistPosition",
             row_number() OVER (
               PARTITION BY "sectionId" ORDER BY "waitlistPosition" ASC
             ) AS rank
      FROM "Enrollment"
      WHERE status = 'WAITLISTED'
        AND "sectionId" IN (${Prisma.join(sectionIds.map((id) => Prisma.sql`${id}::uuid`))})
    `;

    const bySectionAndPosition = new Map<string, number>();
    for (const r of ranked) {
      bySectionAndPosition.set(`${r.sectionId}:${r.waitlistPosition}`, Number(r.rank));
    }
    for (const row of rows) {
      const rank = bySectionAndPosition.get(`${row.sectionId}:${row.waitlistPosition}`);
      if (rank !== undefined) ranks.set(row.id, rank);
    }
    return ranks;
  }

  /** Ordered waitlist for a section, with dense 1..N positions computed on read. */
  async listForSection(sectionId: string): Promise<WaitlistEntryDto[]> {
    const rows = await this.prisma.enrollment.findMany({
      where: { sectionId, status: EnrollmentStatus.WAITLISTED },
      orderBy: { waitlistPosition: 'asc' },
      select: {
        id: true,
        studentId: true,
        createdAt: true,
        student: { select: { firstName: true, lastName: true } },
      },
    });
    return rows.map((r, i) => ({
      position: i + 1,
      enrollmentId: r.id,
      studentId: r.studentId,
      firstName: r.student.firstName,
      lastName: r.student.lastName,
      joinedAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * Admin reorder of a section's waitlist.
   *
   * Runs under the section row lock so the set-equality check and the
   * renumber commit atomically against a concurrent join or drop. The
   * caller must submit every currently WAITLISTED enrollment id for the
   * section; a stale or partial list is rejected with 409
   * WAITLIST_CHANGED rather than silently reconciled.
   */
  async reorder(
    sectionId: string,
    orderedEnrollmentIds: string[],
    actor: RequestActor,
  ): Promise<WaitlistEntryDto[]> {
    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Section" WHERE id = ${sectionId}::uuid FOR UPDATE
      `;
      if (!locked[0]) {
        throw new NotFoundException({
          code: 'SECTION_NOT_FOUND',
          message: 'Section does not exist.',
        });
      }

      const current = await tx.enrollment.findMany({
        where: { sectionId, status: EnrollmentStatus.WAITLISTED },
        orderBy: { waitlistPosition: 'asc' },
        select: { id: true },
      });
      const currentIds = current.map((c) => c.id);

      const currentSet = new Set(currentIds);
      const submittedSet = new Set(orderedEnrollmentIds);
      const sameMembers =
        currentSet.size === submittedSet.size &&
        currentIds.every((id) => submittedSet.has(id));
      if (!sameMembers) {
        throw new ConflictException({
          code: 'WAITLIST_CHANGED',
          message: 'The waitlist changed since it was loaded. Reload and try again.',
        });
      }

      await Promise.all(
        orderedEnrollmentIds.map((id, i) =>
          tx.enrollment.update({
            where: { id },
            data: { waitlistPosition: i + 1 },
          }),
        ),
      );

      await this.audit.recordEvent(tx, {
        action: AuditAction.WAITLIST_REORDERED,
        actor: {
          userId: actor.userId,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        },
        target: { type: 'section', id: sectionId },
        before: { orderedEnrollmentIds: currentIds },
        after: { orderedEnrollmentIds },
      });
    });

    return this.listForSection(sectionId);
  }

  /**
   * Enqueue a promotion sweep for a section.
   *
   * `jobId: sectionId` coalesces concurrent drops on one section into a
   * single queued job. That dedupe has a hole worth naming: it only
   * applies while a job with that id *exists in the queue*. If a job is
   * already active when the next drop commits, this add is silently
   * ignored, and the active job read enrolledCount under its own lock
   * before that commit, so it finishes without seeing the seat that was
   * just freed. The result is an open seat with a non-empty waitlist
   * and nothing scheduled. `sweepPromotable` below is what closes it.
   *
   * Retries matter for the same reason. BullMQ defaults to one attempt,
   * so a transient deadlock or connection reset in runPromotion used to
   * kill the job permanently.
   */
  async enqueuePromotion(sectionId: string): Promise<void> {
    try {
      await this.queue.add(
        'promote',
        { sectionId },
        {
          jobId: sectionId,
          attempts: 5,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
    } catch (err) {
      // A Redis outage must not fail the drop that triggered this: the
      // student's seat release already committed. The counter is what
      // makes the degradation visible, since the sweep will recover the
      // seat within minutes but nothing else would say it happened.
      this.metrics.promotionEnqueueFailures.inc();
      this.logger.error(
        `Failed to enqueue waitlist promotion for section ${sectionId}; the safety-net sweep will pick it up.`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /**
   * Safety net for every way a promotion job can go missing: coalesced
   * away against an active job, lost to a Redis outage during
   * enqueue, or exhausted its retries.
   *
   * Finds sections that are demonstrably wrong (an open seat, a student
   * waiting, registration still open) and re-enqueues them. That turns
   * all of those failure modes into a few minutes of latency instead of
   * a section that stays stuck until the next drop happens to hit it.
   *
   * Deliberately cheap: one indexed query, and re-enqueueing a section
   * that is actually fine costs a no-op job.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweepPromotable(): Promise<void> {
    if (!this.gate.enabled) return;

    const stuck = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT s.id
      FROM "Section" s
      JOIN "Term" t ON t.id = s."termId"
      WHERE s."enrolledCount" < s.capacity
        AND t."registrationOpens" <= NOW()
        AND t."registrationCloses" >= NOW()
        AND EXISTS (
          SELECT 1 FROM "Enrollment" e
          WHERE e."sectionId" = s.id AND e.status = 'WAITLISTED'
        )
    `;
    if (stuck.length === 0) return;

    this.metrics.promotionSweepRecoveries.inc(stuck.length);
    this.logger.warn(
      `Promotion sweep found ${stuck.length} section(s) with an open seat and a waiting student; re-enqueueing.`,
    );
    for (const { id } of stuck) {
      await this.enqueuePromotion(id);
    }
  }

  /**
   * Promotion sweep. Under the section row lock, promote the lowest-position
   * WAITLISTED student to ENROLLED, repeatedly, while there are open seats.
   * No-op if the section is gone, registration has closed, or no seats are open.
   */
  async runPromotion(sectionId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        Array<{
          capacity: number;
          enrolledCount: number;
          registrationCloses: Date;
          courseId: string;
          courseCode: string;
          sectionNumber: string;
        }>
      >`
        SELECT s.capacity, s."enrolledCount", t."registrationCloses",
               c.id AS "courseId", c.code AS "courseCode", s."sectionNumber"
        FROM "Section" s
        JOIN "Term" t ON t.id = s."termId"
        JOIN "Course" c ON c.id = s."courseId"
        WHERE s.id = ${sectionId}::uuid
        FOR UPDATE OF s
      `;
      const sec = locked[0];
      if (!sec) return;
      if (sec.registrationCloses < new Date()) return;

      let count = sec.enrolledCount;
      let promoted = 0;

      while (count < sec.capacity) {
        const next = await tx.enrollment.findFirst({
          where: { sectionId, status: EnrollmentStatus.WAITLISTED },
          orderBy: { waitlistPosition: 'asc' },
          select: { id: true, sectionId: true, waitlistPosition: true },
        });
        if (!next) break;

        const updated = await tx.enrollment.update({
          where: { id: next.id },
          data: {
            status: EnrollmentStatus.ENROLLED,
            enrolledAt: new Date(),
            waitlistPosition: null,
          },
          select: { id: true, sectionId: true, status: true, studentId: true },
        });
        count += 1;
        promoted += 1;

        await this.notifications.createInTx(tx, {
          userId: updated.studentId,
          type: 'WAITLIST_PROMOTED',
          title: 'You were enrolled from the waitlist',
          body: `A seat opened in ${sec.courseCode} section ${sec.sectionNumber} and you were enrolled automatically.`,
          payload: {
            enrollmentId: updated.id,
            sectionId: updated.sectionId,
            courseId: sec.courseId,
          },
        });

        await this.audit.recordEvent(tx, {
          action: AuditAction.ENROLLMENT_PROMOTED,
          actor: { userId: null, ipAddress: null, userAgent: null },
          target: { type: 'enrollment', id: updated.id },
          before: {
            status: EnrollmentStatus.WAITLISTED,
            waitlistPosition: next.waitlistPosition,
          },
          after: { status: EnrollmentStatus.ENROLLED, sectionId: updated.sectionId },
        });
      }

      if (promoted > 0) {
        await tx.section.update({
          where: { id: sectionId },
          data: { enrolledCount: count },
        });
        this.metrics.waitlistPromotions.inc(promoted);
        this.logger.log(
          `Promoted ${promoted} student(s) from section ${sectionId} waitlist.`,
        );
      }
    });
  }

  /**
   * Hourly cleanup: drop leftover WAITLISTED rows in sections whose
   * term's registration has closed. A student left on the waitlist
   * after registration closes has no path to a seat, so the row is
   * dropped (reusing DROPPED rather than adding an enum value) with an
   * audit event and notification distinguishing it from a self-drop.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async expireClosedWaitlists(): Promise<void> {
    // Ungated, two replicas both run this and every affected student
    // gets two "your waitlist spot expired" notifications for one event.
    if (!this.gate.enabled) return;

    const affected = await this.prisma.enrollment.findMany({
      where: {
        status: EnrollmentStatus.WAITLISTED,
        section: { term: { registrationCloses: { lt: new Date() } } },
      },
      select: { sectionId: true },
      distinct: ['sectionId'],
    });

    for (const { sectionId } of affected) {
      await this.expireSectionWaitlist(sectionId);
    }
  }

  private async expireSectionWaitlist(sectionId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Section" WHERE id = ${sectionId}::uuid FOR UPDATE
      `;
      if (!locked[0]) return;

      const rows = await tx.enrollment.findMany({
        where: { sectionId, status: EnrollmentStatus.WAITLISTED },
        select: { id: true, studentId: true, waitlistPosition: true },
      });
      if (rows.length === 0) return;

      for (const row of rows) {
        await tx.enrollment.update({
          where: { id: row.id },
          data: {
            status: EnrollmentStatus.DROPPED,
            droppedAt: new Date(),
            waitlistPosition: null,
          },
        });

        await this.audit.recordEvent(tx, {
          action: AuditAction.ENROLLMENT_WAITLIST_EXPIRED,
          actor: { userId: null, ipAddress: null, userAgent: null },
          target: { type: 'enrollment', id: row.id },
          before: {
            status: EnrollmentStatus.WAITLISTED,
            waitlistPosition: row.waitlistPosition,
          },
          after: { status: EnrollmentStatus.DROPPED },
          metadata: { reason: 'REGISTRATION_CLOSED' },
        });

        await this.notifications.createInTx(tx, {
          userId: row.studentId,
          type: 'WAITLIST_EXPIRED',
          title: 'Your waitlist spot expired',
          body: 'Registration closed before a seat opened, so you were removed from the waitlist.',
          payload: { enrollmentId: row.id, sectionId },
        });
      }

      this.logger.log(
        `Expired ${rows.length} waitlist row(s) for section ${sectionId} (registration closed).`,
      );
    });
  }
}
