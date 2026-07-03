import { InjectQueue } from '@nestjs/bullmq';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EnrollmentStatus, Prisma } from '@prisma/client';
import { AuditAction } from '@enroll/shared';
import { Queue } from 'bullmq';

import { AuditService } from '../audit/audit.service';
import type { RequestActor } from '../enrollment/enrollment.service';
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
  async computeRank(db: Db, sectionId: string, waitlistPosition: number): Promise<number> {
    return db.enrollment.count({
      where: {
        sectionId,
        status: EnrollmentStatus.WAITLISTED,
        waitlistPosition: { lte: waitlistPosition },
      },
    });
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

  /** Enqueue a promotion sweep for a section. Coalesces by jobId so concurrent drops on the same section produce one queued job. */
  async enqueuePromotion(sectionId: string): Promise<void> {
    try {
      await this.queue.add(
        'promote',
        { sectionId },
        { jobId: sectionId, removeOnComplete: true, removeOnFail: 100 },
      );
    } catch (err) {
      this.logger.error(
        `Failed to enqueue waitlist promotion for section ${sectionId}; it will be drained by the next drop on this section.`,
        err instanceof Error ? err.stack : String(err),
      );
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
          payload: { enrollmentId: updated.id, sectionId: updated.sectionId, courseId: sec.courseId },
        });

        await this.audit.recordEvent(tx, {
          action: AuditAction.ENROLLMENT_PROMOTED,
          actor: { userId: null, ipAddress: null, userAgent: null },
          target: { type: 'enrollment', id: updated.id },
          before: { status: EnrollmentStatus.WAITLISTED, waitlistPosition: next.waitlistPosition },
          after: { status: EnrollmentStatus.ENROLLED, sectionId: updated.sectionId },
        });
      }

      if (promoted > 0) {
        await tx.section.update({ where: { id: sectionId }, data: { enrolledCount: count } });
        this.logger.log(`Promoted ${promoted} student(s) from section ${sectionId} waitlist.`);
      }
    });
  }

  // TODO(waitlist-mgmt task 9): expireClosedWaitlists() goes here,
  // scheduled hourly with @Cron from @nestjs/schedule (ScheduleModule is
  // already registered in AppModule). Find sections that still have
  // WAITLISTED rows in terms past registrationCloses; per section, under
  // the section lock: set rows DROPPED with droppedAt stamped and
  // waitlistPosition null, audit ENROLLMENT_WAITLIST_EXPIRED with
  // metadata reason REGISTRATION_CLOSED and a null actor, and write a
  // WAITLIST_EXPIRED notification per row.
}
