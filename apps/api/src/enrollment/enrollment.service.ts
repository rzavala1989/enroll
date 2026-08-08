import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EnrollmentStatus } from '@prisma/client';
import { AuditAction } from '@enroll/shared';

import { AuditService } from '../audit/audit.service';
import { MetricsService } from '../common/metrics.service';
import type { RequestActor } from '../common/request-actor';
import { PrismaService } from '../prisma/prisma.service';
import { WaitlistService } from '../waitlist/waitlist.service';
import { EnrollDto, EnrollmentResultDto, SwapDto } from './dto/enroll.dto';
import { ListMyEnrollmentsQueryDto } from './dto/list-my-enrollments-query.dto';
import { MyEnrollmentDto } from './dto/my-enrollment.dto';
import { hasTimeConflict } from './time-conflict';

@Injectable()
export class EnrollmentService {
  private readonly logger = new Logger(EnrollmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly waitlist: WaitlistService,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * Enroll a student in a section.
   *
   * The contract:
   *   1. Verify the term's registration window is open.
   *   2. Reject if the student already has an ENROLLED or WAITLISTED row
   *      for this section.
   *   3. Take a row-level lock on the Section via SELECT ... FOR UPDATE
   *      so that two concurrent transactions cannot both read the same
   *      enrolledCount and both pass the capacity check.
   *   4. Under the lock: if a seat is free, INSERT an ENROLLED row and
   *      bump the denormalized counter; otherwise INSERT a WAITLISTED row
   *      at the next sparse waitlist position. The partial unique index
   *      (studentId, sectionId) WHERE status IN ('ENROLLED','WAITLISTED')
   *      backstops step 2 if two requests slip past the lock.
   *   5. Commit. A drop later frees a seat and enqueues a promotion sweep
   *      (see WaitlistService).
   *
   * Why pessimistic and not optimistic? Registration day is a known
   * high-contention event by design. Optimistic locking (version column,
   * retry-on-conflict) wastes round trips when contention is the norm.
   * Pessimistic locking takes the cost upfront, gets predictable
   * latency, and lets Postgres serialize seat allocation cleanly.
   */
  async enroll(
    input: EnrollDto,
    userId: string,
    actor: RequestActor,
  ): Promise<EnrollmentResultDto> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Section + Term gate.
      const section = await tx.section.findUnique({
        where: { id: input.sectionId },
        select: {
          id: true,
          courseId: true,
          termId: true,
          meetingPattern: true,
          capacity: true,
          enrolledCount: true,
          course: { select: { credits: true } },
          term: {
            select: {
              registrationOpens: true,
              registrationCloses: true,
              maxCredits: true,
            },
          },
        },
      });
      if (!section) {
        throw new NotFoundException({
          code: 'SECTION_NOT_FOUND',
          message: 'Section does not exist.',
        });
      }
      const now = new Date();
      if (now > section.term.registrationCloses) {
        throw new BadRequestException({
          code: 'REGISTRATION_CLOSED',
          message: "Registration has closed for the section's term.",
        });
      }

      // 2. Verify the student exists.
      const student = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, classStanding: true },
      });
      if (!student) {
        throw new NotFoundException({
          code: 'STUDENT_NOT_FOUND',
          message: 'Student does not exist.',
        });
      }

      // 2b. Standing-aware registration window. If the term has
      // per-standing windows, the student's window must be open;
      // otherwise fall back to the term's registrationOpens.
      const window = student.classStanding
        ? await tx.registrationWindow.findUnique({
            where: {
              termId_classStanding: {
                termId: section.termId,
                classStanding: student.classStanding,
              },
            },
            select: { opensAt: true },
          })
        : null;
      const effectiveOpens = window?.opensAt ?? section.term.registrationOpens;
      if (now < effectiveOpens) {
        throw new BadRequestException({
          code: 'REGISTRATION_NOT_OPEN',
          message: student.classStanding
            ? `Registration for ${student.classStanding.toLowerCase()}s opens ${effectiveOpens.toISOString()}.`
            : `Registration opens ${effectiveOpens.toISOString()}.`,
        });
      }

      // 2c. Advisor hold: an active hold blocks all registration.
      const hold = await tx.advisorHold.findFirst({
        where: { studentId: userId, releasedAt: null },
        select: { reason: true },
      });
      if (hold) {
        throw new BadRequestException({
          code: 'ADVISOR_HOLD',
          message: `Registration blocked by advisor hold: ${hold.reason}`,
        });
      }

      // 3. Take the row lock and re-read seats. SELECT FOR UPDATE
      //    blocks any other transaction trying to lock the same row
      //    until ours commits or rolls back.
      const locked = await tx.$queryRaw<
        Array<{
          id: string;
          capacity: number;
          enrolledCount: number;
          waitlistCap: number | null;
        }>
      >`
        SELECT id, capacity, "enrolledCount", "waitlistCap"
        FROM "Section"
        WHERE id = ${input.sectionId}::uuid
        FOR UPDATE
      `;
      const live = locked[0];
      if (!live) {
        // Section vanished between findUnique and FOR UPDATE
        // (shouldn't happen in practice; covers admin DELETE racing).
        throw new NotFoundException({
          code: 'SECTION_NOT_FOUND',
          message: 'Section disappeared mid-enrollment.',
        });
      }

      /**
       * Active-row check: a student is enrolled, waitlisted, or neither
       * for a section.
       *
       * A repeat request for a section the student already holds
       * converges on the existing row instead of failing. Registration
       * day clients retry, double-click, and get re-mounted, and
       * answering "409, you already succeeded" to a request whose
       * desired state is already true generates support tickets rather
       * than preventing anything. The partial unique index on
       * (studentId, sectionId) WHERE status IN ('ENROLLED','WAITLISTED')
       * is what actually makes a double row impossible; this branch
       * just decides how to report the no-op.
       */
      const active = await tx.enrollment.findFirst({
        where: {
          studentId: userId,
          sectionId: input.sectionId,
          status: { in: [EnrollmentStatus.ENROLLED, EnrollmentStatus.WAITLISTED] },
        },
        select: {
          id: true,
          studentId: true,
          sectionId: true,
          status: true,
          enrolledAt: true,
          waitlistPosition: true,
        },
      });
      if (active) {
        this.metrics.enrollOutcomes.inc({
          outcome:
            active.status === EnrollmentStatus.ENROLLED
              ? 'already_enrolled'
              : 'already_waitlisted',
        });
        return {
          id: active.id,
          studentId: active.studentId,
          sectionId: active.sectionId,
          status: active.status,
          enrolledAt: active.enrolledAt.toISOString(),
          sectionEnrolledCount: live.enrolledCount,
          sectionCapacity: live.capacity,
          ...(active.status === EnrollmentStatus.WAITLISTED &&
          active.waitlistPosition != null
            ? {
                waitlistPosition: await this.waitlist.computeRank(
                  tx,
                  input.sectionId,
                  active.waitlistPosition,
                ),
              }
            : {}),
        };
      }

      // Same-course duplicate: a student cannot hold active enrollments
      // in two different sections of the same course.
      const sameCourse = await tx.enrollment.findFirst({
        where: {
          studentId: userId,
          status: { in: [EnrollmentStatus.ENROLLED, EnrollmentStatus.WAITLISTED] },
          section: { courseId: section.courseId },
          NOT: { sectionId: input.sectionId },
        },
        select: { id: true },
      });
      if (sameCourse) {
        throw new ConflictException({
          code: 'DUPLICATE_COURSE',
          message: 'You are already enrolled in another section of this course.',
        });
      }

      // Prerequisite gate: every course in CoursePrerequisite for the
      // target course must appear in the student's COMPLETED history.
      const prereqs = await tx.coursePrerequisite.findMany({
        where: { courseId: section.courseId },
        select: { prerequisiteId: true },
      });
      if (prereqs.length > 0) {
        const completedRows = await tx.enrollment.findMany({
          where: {
            studentId: userId,
            status: EnrollmentStatus.COMPLETED,
          },
          select: { section: { select: { courseId: true } } },
        });
        const completed = new Set(completedRows.map((r) => r.section.courseId));
        const missing = prereqs.filter((p) => !completed.has(p.prerequisiteId));
        if (missing.length > 0) {
          throw new BadRequestException({
            code: 'PREREQUISITE_NOT_MET',
            message: 'You have not completed all prerequisite courses.',
          });
        }
      }

      // Time-conflict check: compare the target section's meeting pattern
      // against every section the student is already active in this term.
      const myActive = await tx.enrollment.findMany({
        where: {
          studentId: userId,
          status: { in: [EnrollmentStatus.ENROLLED, EnrollmentStatus.WAITLISTED] },
          section: { termId: section.termId },
        },
        select: {
          sectionId: true,
          section: {
            select: {
              meetingPattern: true,
              sectionNumber: true,
              course: { select: { code: true, credits: true } },
            },
          },
        },
      });
      for (const existing of myActive) {
        if (existing.sectionId === input.sectionId) continue;
        if (hasTimeConflict(section.meetingPattern, existing.section.meetingPattern)) {
          throw new ConflictException({
            code: 'TIME_CONFLICT',
            message: `Schedule conflict with ${existing.section.course.code} section ${existing.section.sectionNumber}.`,
          });
        }
      }

      // Credit limit: the student's active credits in this term plus
      // the target course's credits must not exceed the term cap (or
      // an advisor-approved overload limit).
      const currentCredits = myActive
        .filter((e) => e.sectionId !== input.sectionId)
        .reduce((sum, e) => sum + e.section.course.credits, 0);
      const overload = await tx.overloadApproval.findUnique({
        where: {
          studentId_termId: { studentId: userId, termId: section.termId },
        },
        select: { maxCredits: true },
      });
      const creditCap = overload?.maxCredits ?? section.term.maxCredits;
      const proposed = currentCredits + section.course.credits;
      if (proposed > creditCap) {
        throw new BadRequestException({
          code: 'CREDIT_LIMIT_EXCEEDED',
          message: `Adding ${section.course.credits} credits would bring you to ${proposed}, exceeding the ${creditCap} credit limit.`,
        });
      }

      // Seat available means enroll. Otherwise, waitlist.
      if (live.enrolledCount < live.capacity) {
        const enrollment = await tx.enrollment.create({
          data: {
            studentId: userId,
            sectionId: input.sectionId,
            status: EnrollmentStatus.ENROLLED,
          },
          select: {
            id: true,
            studentId: true,
            sectionId: true,
            status: true,
            enrolledAt: true,
          },
        });

        const updated = await tx.section.update({
          where: { id: input.sectionId },
          data: { enrolledCount: { increment: 1 } },
          select: { capacity: true, enrolledCount: true },
        });

        await this.audit.recordEvent(tx, {
          action: AuditAction.ENROLLMENT_CREATED,
          actor: { userId, ipAddress: actor.ipAddress, userAgent: actor.userAgent },
          target: { type: 'enrollment', id: enrollment.id },
          before: null,
          after: { sectionId: enrollment.sectionId, status: enrollment.status },
        });

        this.metrics.enrollOutcomes.inc({ outcome: 'enrolled' });
        return {
          ...enrollment,
          enrolledAt: enrollment.enrolledAt.toISOString(),
          sectionEnrolledCount: updated.enrolledCount,
          sectionCapacity: updated.capacity,
        };
      }

      // Section full: the waitlist takes over, unless it is capped and
      // already full. SECTION_FULL therefore means "no seat AND no
      // waitlist space"; an uncapped or open waitlist never hits it.
      if (live.waitlistCap != null) {
        const waiting = await tx.enrollment.count({
          where: {
            sectionId: input.sectionId,
            status: EnrollmentStatus.WAITLISTED,
          },
        });
        if (waiting >= live.waitlistCap) {
          this.metrics.enrollOutcomes.inc({ outcome: 'section_full' });
          throw new ConflictException({
            code: 'SECTION_FULL',
            message: 'Section and its waitlist are full.',
          });
        }
      }

      // Create a WAITLISTED row at the next sparse position.
      const position = await this.waitlist.assignPosition(tx, input.sectionId);
      const enrollment = await tx.enrollment.create({
        data: {
          studentId: userId,
          sectionId: input.sectionId,
          status: EnrollmentStatus.WAITLISTED,
          waitlistPosition: position,
        },
        select: {
          id: true,
          studentId: true,
          sectionId: true,
          status: true,
          enrolledAt: true,
        },
      });
      const rank = await this.waitlist.computeRank(tx, input.sectionId, position);

      await this.audit.recordEvent(tx, {
        action: AuditAction.ENROLLMENT_WAITLISTED,
        actor: { userId, ipAddress: actor.ipAddress, userAgent: actor.userAgent },
        target: { type: 'enrollment', id: enrollment.id },
        before: null,
        after: {
          sectionId: enrollment.sectionId,
          status: enrollment.status,
          waitlistPosition: position,
        },
      });

      this.metrics.enrollOutcomes.inc({ outcome: 'waitlisted' });
      return {
        ...enrollment,
        enrolledAt: enrollment.enrolledAt.toISOString(),
        sectionEnrolledCount: live.enrolledCount,
        sectionCapacity: live.capacity,
        waitlistPosition: rank,
      };
    });
  }

  /**
   * Drop an active enrollment.
   *
   * Pattern mirrors enroll():
   *   1. Read the row once, unlocked, purely to learn its sectionId.
   *   2. Lock the Section row with SELECT ... FOR UPDATE.
   *   3. Re-read the enrollment status *under that lock*, and perform
   *      the transition with a conditional updateMany whose WHERE
   *      carries the expected status.
   *
   * Steps 2 and 3 are what make concurrent drops of the same row safe.
   * An unlocked status read followed by an unconditional update lets
   * two transactions each see ENROLLED, serialize on the lock, and both
   * write DROPPED and both decrement enrolledCount, corrupting the
   * counter by one and manufacturing a phantom free seat that triggers
   * a bogus waitlist promotion. Re-reading under the lock closes the
   * window; the status predicate on updateMany is the second line of
   * defense, and its zero-row result is the idempotent exit.
   *
   * The denormalized counter never goes negative because the CHECK
   * `enrolledCount >= 0` constraint on Section blocks it. That
   * constraint is a backstop, not the mechanism.
   */
  async drop(
    enrollmentId: string,
    userId: string,
    actor: RequestActor,
  ): Promise<EnrollmentResultDto> {
    const { result, freedSeatSectionId } = await this.prisma.$transaction(async (tx) => {
      const enrollment = await tx.enrollment.findUnique({
        where: { id: enrollmentId },
        select: { id: true, sectionId: true },
      });
      if (!enrollment) {
        throw new NotFoundException('Enrollment not found.');
      }

      // Everything below runs under the section lock, so a concurrent
      // drop, promotion, or capacity edit on this section is serialized
      // behind us rather than interleaved with us.
      await tx.$queryRaw`
        SELECT id FROM "Section" WHERE id = ${enrollment.sectionId}::uuid FOR UPDATE
      `;

      // Authoritative status read: the pre-lock findUnique above may
      // already be stale (a promotion could have flipped WAITLISTED to
      // ENROLLED while we waited for the lock).
      const current = await tx.enrollment.findUnique({
        where: { id: enrollmentId },
        select: {
          id: true,
          studentId: true,
          sectionId: true,
          status: true,
          waitlistPosition: true,
          enrolledAt: true,
        },
      });
      if (!current) {
        throw new NotFoundException('Enrollment not found.');
      }

      if (
        current.status !== EnrollmentStatus.ENROLLED &&
        current.status !== EnrollmentStatus.WAITLISTED
      ) {
        throw new BadRequestException({
          code: 'ALREADY_DROPPED',
          message: `Cannot drop an enrollment in status ${current.status}.`,
        });
      }

      const fromStatus = current.status;
      const droppedAt = new Date();

      // Conditional transition. count === 0 means another transaction
      // moved this row out of `fromStatus` after our read, which the
      // lock should already prevent; treat it as an idempotent no-op
      // rather than decrementing a counter a second time.
      const transitioned = await tx.enrollment.updateMany({
        where: { id: enrollmentId, status: fromStatus },
        data: {
          status: EnrollmentStatus.DROPPED,
          droppedAt,
          waitlistPosition: null,
        },
      });
      if (transitioned.count === 0) {
        throw new ConflictException({
          code: 'ALREADY_DROPPED',
          message: 'This enrollment was already dropped.',
        });
      }

      // Leaving the waitlist frees no seat, so no counter change and no
      // promotion job. Dropping an enrolled student does both.
      const freedSeat = fromStatus === EnrollmentStatus.ENROLLED;
      const section = freedSeat
        ? await tx.section.update({
            where: { id: current.sectionId },
            data: { enrolledCount: { decrement: 1 } },
            select: { capacity: true, enrolledCount: true },
          })
        : await tx.section.findUnique({
            where: { id: current.sectionId },
            select: { capacity: true, enrolledCount: true },
          });

      await this.audit.recordEvent(tx, {
        action: freedSeat
          ? AuditAction.ENROLLMENT_DROPPED
          : AuditAction.ENROLLMENT_WAITLIST_LEFT,
        actor: {
          userId: actor.userId,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        },
        target: { type: 'enrollment', id: current.id },
        before: freedSeat
          ? { sectionId: current.sectionId, status: fromStatus }
          : { status: fromStatus, waitlistPosition: current.waitlistPosition },
        after: freedSeat
          ? { sectionId: current.sectionId, status: EnrollmentStatus.DROPPED }
          : { status: EnrollmentStatus.DROPPED },
      });

      return {
        result: {
          id: current.id,
          studentId: current.studentId,
          sectionId: current.sectionId,
          status: EnrollmentStatus.DROPPED,
          enrolledAt: current.enrolledAt.toISOString(),
          droppedAt: droppedAt.toISOString(),
          sectionEnrolledCount: section?.enrolledCount ?? 0,
          sectionCapacity: section?.capacity ?? 0,
        } as EnrollmentResultDto,
        freedSeatSectionId: (freedSeat ? current.sectionId : null) as string | null,
      };
    });

    if (freedSeatSectionId) {
      await this.waitlist.enqueuePromotion(freedSeatSectionId);
    }
    return result;
  }

  async swap(
    enrollmentId: string,
    input: SwapDto,
    userId: string,
    actor: RequestActor,
  ): Promise<EnrollmentResultDto> {
    const { result, freedSeatSectionId } = await this.prisma.$transaction(async (tx) => {
      // 1. Read the source enrollment.
      const source = await tx.enrollment.findUnique({
        where: { id: enrollmentId },
        select: {
          id: true,
          studentId: true,
          sectionId: true,
          status: true,
          section: {
            select: {
              courseId: true,
              termId: true,
              meetingPattern: true,
              course: { select: { credits: true } },
            },
          },
        },
      });
      if (!source) {
        throw new NotFoundException('Enrollment not found.');
      }
      if (
        source.status !== EnrollmentStatus.ENROLLED &&
        source.status !== EnrollmentStatus.WAITLISTED
      ) {
        throw new BadRequestException({
          code: 'ALREADY_DROPPED',
          message: `Cannot swap an enrollment in status ${source.status}.`,
        });
      }

      // Swapping to the same section is a no-op.
      if (source.sectionId === input.targetSectionId) {
        const sec = await tx.section.findUnique({
          where: { id: source.sectionId },
          select: { capacity: true, enrolledCount: true },
        });
        return {
          result: {
            id: source.id,
            studentId: source.studentId,
            sectionId: source.sectionId,
            status: source.status,
            enrolledAt:
              (source as any).enrolledAt?.toISOString?.() ?? new Date().toISOString(),
            sectionEnrolledCount: sec?.enrolledCount ?? 0,
            sectionCapacity: sec?.capacity ?? 0,
          } as EnrollmentResultDto,
          freedSeatSectionId: null as string | null,
        };
      }

      // 2. Read the target section.
      const target = await tx.section.findUnique({
        where: { id: input.targetSectionId },
        select: {
          id: true,
          courseId: true,
          termId: true,
          meetingPattern: true,
          capacity: true,
          enrolledCount: true,
          course: { select: { credits: true } },
          term: {
            select: {
              registrationOpens: true,
              registrationCloses: true,
              maxCredits: true,
            },
          },
        },
      });
      if (!target) {
        throw new NotFoundException({
          code: 'SECTION_NOT_FOUND',
          message: 'Target section does not exist.',
        });
      }

      const now = new Date();
      if (now > target.term.registrationCloses) {
        throw new BadRequestException({
          code: 'REGISTRATION_CLOSED',
          message: "Registration has closed for the target section's term.",
        });
      }

      // 3. Student verification, standing window, advisor hold.
      const student = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, classStanding: true },
      });
      if (!student) {
        throw new NotFoundException({
          code: 'STUDENT_NOT_FOUND',
          message: 'Student does not exist.',
        });
      }

      const window = student.classStanding
        ? await tx.registrationWindow.findUnique({
            where: {
              termId_classStanding: {
                termId: target.termId,
                classStanding: student.classStanding,
              },
            },
            select: { opensAt: true },
          })
        : null;
      const effectiveOpens = window?.opensAt ?? target.term.registrationOpens;
      if (now < effectiveOpens) {
        throw new BadRequestException({
          code: 'REGISTRATION_NOT_OPEN',
          message: student.classStanding
            ? `Registration for ${student.classStanding.toLowerCase()}s opens ${effectiveOpens.toISOString()}.`
            : `Registration opens ${effectiveOpens.toISOString()}.`,
        });
      }

      const hold = await tx.advisorHold.findFirst({
        where: { studentId: userId, releasedAt: null },
        select: { reason: true },
      });
      if (hold) {
        throw new BadRequestException({
          code: 'ADVISOR_HOLD',
          message: `Registration blocked by advisor hold: ${hold.reason}`,
        });
      }

      // 4. Lock both sections in a consistent order to avoid deadlocks.
      const [firstId, secondId] = [source.sectionId, input.targetSectionId].sort();
      await tx.$queryRaw`
        SELECT id FROM "Section"
        WHERE id IN (${firstId}::uuid, ${secondId}::uuid)
        ORDER BY id
        FOR UPDATE
      `;

      // Re-read source enrollment under lock.
      const lockedSource = await tx.enrollment.findUnique({
        where: { id: enrollmentId },
        select: { id: true, status: true, enrolledAt: true, waitlistPosition: true },
      });
      if (
        !lockedSource ||
        (lockedSource.status !== EnrollmentStatus.ENROLLED &&
          lockedSource.status !== EnrollmentStatus.WAITLISTED)
      ) {
        throw new BadRequestException({
          code: 'ALREADY_DROPPED',
          message: 'Source enrollment is no longer active.',
        });
      }

      // Re-read target section capacity under lock.
      const lockedTarget = await tx.$queryRaw<
        Array<{ id: string; capacity: number; enrolledCount: number }>
      >`
        SELECT id, capacity, "enrolledCount"
        FROM "Section"
        WHERE id = ${input.targetSectionId}::uuid
      `;
      const liveTarget = lockedTarget[0];
      if (!liveTarget || liveTarget.enrolledCount >= liveTarget.capacity) {
        throw new ConflictException({
          code: 'SWAP_TARGET_FULL',
          message: 'The target section has no available seats.',
        });
      }

      // 5. Eligibility checks against the target section.

      // Same-course duplicate: skip if swapping within the same course.
      const sameCourse = source.section.courseId === target.courseId;
      if (!sameCourse) {
        const dup = await tx.enrollment.findFirst({
          where: {
            studentId: userId,
            status: { in: [EnrollmentStatus.ENROLLED, EnrollmentStatus.WAITLISTED] },
            section: { courseId: target.courseId },
            NOT: { id: enrollmentId },
          },
          select: { id: true },
        });
        if (dup) {
          throw new ConflictException({
            code: 'DUPLICATE_COURSE',
            message: 'You are already enrolled in another section of the target course.',
          });
        }
      }

      // Prerequisite check (only for cross-course swaps).
      if (!sameCourse) {
        const prereqs = await tx.coursePrerequisite.findMany({
          where: { courseId: target.courseId },
          select: { prerequisiteId: true },
        });
        if (prereqs.length > 0) {
          const completedRows = await tx.enrollment.findMany({
            where: { studentId: userId, status: EnrollmentStatus.COMPLETED },
            select: { section: { select: { courseId: true } } },
          });
          const completed = new Set(completedRows.map((r) => r.section.courseId));
          const missing = prereqs.filter((p) => !completed.has(p.prerequisiteId));
          if (missing.length > 0) {
            throw new BadRequestException({
              code: 'PREREQUISITE_NOT_MET',
              message:
                'You have not completed all prerequisite courses for the target section.',
            });
          }
        }
      }

      // Time conflicts: exclude the source section.
      const myActive = await tx.enrollment.findMany({
        where: {
          studentId: userId,
          status: { in: [EnrollmentStatus.ENROLLED, EnrollmentStatus.WAITLISTED] },
          section: { termId: target.termId },
          NOT: { id: enrollmentId },
        },
        select: {
          sectionId: true,
          section: {
            select: {
              meetingPattern: true,
              sectionNumber: true,
              course: { select: { code: true, credits: true } },
            },
          },
        },
      });
      for (const existing of myActive) {
        if (hasTimeConflict(target.meetingPattern, existing.section.meetingPattern)) {
          throw new ConflictException({
            code: 'TIME_CONFLICT',
            message: `Schedule conflict with ${existing.section.course.code} section ${existing.section.sectionNumber}.`,
          });
        }
      }

      // Credit limit: exclude the source section's credits.
      const currentCredits = myActive.reduce(
        (sum, e) => sum + e.section.course.credits,
        0,
      );
      const overload = await tx.overloadApproval.findUnique({
        where: {
          studentId_termId: { studentId: userId, termId: target.termId },
        },
        select: { maxCredits: true },
      });
      const creditCap = overload?.maxCredits ?? target.term.maxCredits;
      const proposed = currentCredits + target.course.credits;
      if (proposed > creditCap) {
        throw new BadRequestException({
          code: 'CREDIT_LIMIT_EXCEEDED',
          message: `Adding ${target.course.credits} credits would bring you to ${proposed}, exceeding the ${creditCap} credit limit.`,
        });
      }

      // 6. Execute the swap atomically.

      const wasEnrolled = lockedSource.status === EnrollmentStatus.ENROLLED;
      const droppedAt = new Date();

      // Drop the source enrollment.
      await tx.enrollment.update({
        where: { id: enrollmentId },
        data: {
          status: EnrollmentStatus.DROPPED,
          droppedAt,
          waitlistPosition: null,
        },
      });

      if (wasEnrolled) {
        await tx.section.update({
          where: { id: source.sectionId },
          data: { enrolledCount: { decrement: 1 } },
        });
      }

      // Create the new enrollment in the target section.
      const newEnrollment = await tx.enrollment.create({
        data: {
          studentId: userId,
          sectionId: input.targetSectionId,
          status: EnrollmentStatus.ENROLLED,
        },
        select: {
          id: true,
          studentId: true,
          sectionId: true,
          status: true,
          enrolledAt: true,
        },
      });

      const updatedTarget = await tx.section.update({
        where: { id: input.targetSectionId },
        data: { enrolledCount: { increment: 1 } },
        select: { capacity: true, enrolledCount: true },
      });

      await this.audit.recordEvent(tx, {
        action: AuditAction.ENROLLMENT_SWAPPED,
        actor: { userId, ipAddress: actor.ipAddress, userAgent: actor.userAgent },
        target: { type: 'enrollment', id: newEnrollment.id },
        before: {
          enrollmentId: source.id,
          sectionId: source.sectionId,
          status: lockedSource.status,
        },
        after: {
          enrollmentId: newEnrollment.id,
          sectionId: newEnrollment.sectionId,
          status: newEnrollment.status,
        },
      });

      return {
        result: {
          ...newEnrollment,
          enrolledAt: newEnrollment.enrolledAt.toISOString(),
          sectionEnrolledCount: updatedTarget.enrolledCount,
          sectionCapacity: updatedTarget.capacity,
        } as EnrollmentResultDto,
        freedSeatSectionId: (wasEnrolled ? source.sectionId : null) as string | null,
      };
    });

    if (freedSeatSectionId) {
      await this.waitlist.enqueuePromotion(freedSeatSectionId);
    }
    return result;
  }

  /**
   * A student's enrollments, newest first.
   *
   * Bounded now. The response is still a bare array rather than a
   * paginated envelope: the web app splits the rows into active and
   * past client-side and there is no external consumer to migrate, so
   * changing the shape would cost more than it buys. The limit is what
   * matters, and 100 rows covers any real student's whole career.
   */
  async listMine(
    studentId: string,
    query: ListMyEnrollmentsQueryDto = {},
  ): Promise<MyEnrollmentDto[]> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 100;
    const statuses = query.status
      ? Array.isArray(query.status)
        ? query.status
        : [query.status]
      : undefined;

    const rows = await this.prisma.enrollment.findMany({
      where: {
        studentId,
        ...(statuses ? { status: { in: statuses } } : {}),
      },
      orderBy: { enrolledAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
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

    // One window query for every waitlisted row on the page, instead of
    // a count per row.
    const ranks = await this.waitlist.computeRanks(
      this.prisma,
      rows
        .filter(
          (row) =>
            row.status === EnrollmentStatus.WAITLISTED && row.waitlistPosition != null,
        )
        .map((row) => ({
          id: row.id,
          sectionId: row.section.id,
          waitlistPosition: row.waitlistPosition as number,
        })),
    );

    return rows.map((row) => {
      const { course, ...section } = row.section;
      return {
        id: row.id,
        status: row.status,
        enrolledAt: row.enrolledAt.toISOString(),
        waitlistPosition: ranks.get(row.id),
        section,
        course,
      };
    });
  }

  async findOne(enrollmentId: string): Promise<EnrollmentResultDto> {
    const e = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: {
        id: true,
        studentId: true,
        sectionId: true,
        status: true,
        enrolledAt: true,
        waitlistPosition: true,
        droppedAt: true,
        completedAt: true,
        section: { select: { capacity: true, enrolledCount: true } },
      },
    });
    if (!e) throw new NotFoundException('Enrollment not found.');

    let waitlistPosition: number | undefined;
    if (e.status === EnrollmentStatus.WAITLISTED && e.waitlistPosition != null) {
      waitlistPosition = await this.waitlist.computeRank(
        this.prisma,
        e.sectionId,
        e.waitlistPosition,
      );
    }

    return {
      id: e.id,
      studentId: e.studentId,
      sectionId: e.sectionId,
      status: e.status,
      enrolledAt: e.enrolledAt.toISOString(),
      sectionEnrolledCount: e.section.enrolledCount,
      sectionCapacity: e.section.capacity,
      waitlistPosition,
      droppedAt: e.droppedAt?.toISOString(),
      completedAt: e.completedAt?.toISOString(),
    };
  }
}
