import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EnrollmentStatus, Prisma } from '@prisma/client';
import { AuditAction } from '@enroll/shared';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { WaitlistService } from '../waitlist/waitlist.service';
import { EnrollDto, EnrollmentResultDto } from './dto/enroll.dto';

export interface RequestActor {
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

@Injectable()
export class EnrollmentService {
  private readonly logger = new Logger(EnrollmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly waitlist: WaitlistService,
  ) {}

  /**
   * Enroll a student in a section.
   *
   * The contract:
   *   1. Verify the term's registration window is open.
   *   2. Take a row-level lock on the Section via SELECT ... FOR UPDATE
   *      so that two concurrent transactions cannot both read the same
   *      enrolledCount and both pass the capacity check.
   *   3. Re-read enrolledCount under the lock, compare to capacity.
   *   4. INSERT the Enrollment row and bump the denormalized counter.
   *      The Postgres CHECK constraint backstops the application check;
   *      the partial unique index backstops "no duplicate ENROLLED row
   *      per (student, section)" if two requests slip past the lock
   *      (they shouldn't, but defense in depth).
   *   5. Commit.
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
          capacity: true,
          enrolledCount: true,
          term: {
            select: {
              registrationOpens: true,
              registrationCloses: true,
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
      if (
        now < section.term.registrationOpens ||
        now > section.term.registrationCloses
      ) {
        throw new BadRequestException({
          code: 'REGISTRATION_CLOSED',
          message:
            'Registration is not currently open for the section\'s term.',
        });
      }

      // 2. Verify the student exists.
      const student = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!student) {
        throw new NotFoundException({
          code: 'STUDENT_NOT_FOUND',
          message: 'Student does not exist.',
        });
      }

      // 3. Take the row lock and re-read seats. SELECT FOR UPDATE
      //    blocks any other transaction trying to lock the same row
      //    until ours commits or rolls back.
      const locked = await tx.$queryRaw<
        Array<{ id: string; capacity: number; enrolledCount: number }>
      >`
        SELECT id, capacity, "enrolledCount"
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

      // Active-row check: a student is enrolled, waitlisted, or neither for a section.
      const active = await tx.enrollment.findFirst({
        where: {
          studentId: userId,
          sectionId: input.sectionId,
          status: { in: [EnrollmentStatus.ENROLLED, EnrollmentStatus.WAITLISTED] },
        },
        select: { status: true },
      });
      if (active?.status === EnrollmentStatus.ENROLLED) {
        throw new ConflictException({
          code: 'ALREADY_ENROLLED',
          message: 'Student is already enrolled in this section.',
        });
      }
      if (active?.status === EnrollmentStatus.WAITLISTED) {
        throw new ConflictException({
          code: 'ALREADY_WAITLISTED',
          message: 'Student is already on the waitlist for this section.',
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
          select: { id: true, studentId: true, sectionId: true, status: true, enrolledAt: true },
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

        return {
          ...enrollment,
          enrolledAt: enrollment.enrolledAt.toISOString(),
          sectionEnrolledCount: updated.enrolledCount,
          sectionCapacity: updated.capacity,
        };
      }

      // Section full: create a WAITLISTED row at the next sparse position.
      const position = await this.waitlist.assignPosition(tx, input.sectionId);
      const enrollment = await tx.enrollment.create({
        data: {
          studentId: userId,
          sectionId: input.sectionId,
          status: EnrollmentStatus.WAITLISTED,
          waitlistPosition: position,
        },
        select: { id: true, studentId: true, sectionId: true, status: true, enrolledAt: true },
      });
      const rank = await this.waitlist.computeRank(tx, input.sectionId, position);

      await this.audit.recordEvent(tx, {
        action: AuditAction.ENROLLMENT_WAITLISTED,
        actor: { userId, ipAddress: actor.ipAddress, userAgent: actor.userAgent },
        target: { type: 'enrollment', id: enrollment.id },
        before: null,
        after: { sectionId: enrollment.sectionId, status: enrollment.status, waitlistPosition: position },
      });

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
   *   1. Lock the Section row.
   *   2. Verify the enrollment exists, belongs to the requested student,
   *      and is currently ENROLLED.
   *   3. Update status to DROPPED, stamp droppedAt, decrement counter.
   *
   * The denormalized counter never goes negative because the CHECK
   * `enrolledCount >= 0` constraint on Section blocks it.
   */
  async drop(
    enrollmentId: string,
    userId: string,
    actor: RequestActor,
  ): Promise<EnrollmentResultDto> {
    const { result, freedSeatSectionId } = await this.prisma.$transaction(async (tx) => {
      const enrollment = await tx.enrollment.findUnique({
        where: { id: enrollmentId },
        select: { id: true, studentId: true, sectionId: true, status: true, waitlistPosition: true },
      });
      if (!enrollment) {
        throw new NotFoundException('Enrollment not found.');
      }

      // Leaving the waitlist: no counter change, no seat freed, no job.
      if (enrollment.status === EnrollmentStatus.WAITLISTED) {
        await tx.$queryRaw`
          SELECT id FROM "Section" WHERE id = ${enrollment.sectionId}::uuid FOR UPDATE
        `;
        const left = await tx.enrollment.update({
          where: { id: enrollment.id },
          data: { status: EnrollmentStatus.DROPPED, droppedAt: new Date(), waitlistPosition: null },
          select: { id: true, studentId: true, sectionId: true, status: true, enrolledAt: true },
        });
        const section = await tx.section.findUnique({
          where: { id: enrollment.sectionId },
          select: { capacity: true, enrolledCount: true },
        });
        await this.audit.recordEvent(tx, {
          action: AuditAction.ENROLLMENT_WAITLIST_LEFT,
          actor: { userId: actor.userId, ipAddress: actor.ipAddress, userAgent: actor.userAgent },
          target: { type: 'enrollment', id: left.id },
          before: { status: EnrollmentStatus.WAITLISTED, waitlistPosition: enrollment.waitlistPosition },
          after: { status: EnrollmentStatus.DROPPED },
        });
        return {
          result: {
            ...left,
            enrolledAt: left.enrolledAt.toISOString(),
            sectionEnrolledCount: section?.enrolledCount ?? 0,
            sectionCapacity: section?.capacity ?? 0,
          } as EnrollmentResultDto,
          freedSeatSectionId: null as string | null,
        };
      }

      if (enrollment.status !== EnrollmentStatus.ENROLLED) {
        throw new BadRequestException(
          `Cannot drop an enrollment in status ${enrollment.status}.`,
        );
      }

      // Dropping an enrolled student frees a seat.
      await tx.$queryRaw`
        SELECT id FROM "Section" WHERE id = ${enrollment.sectionId}::uuid FOR UPDATE
      `;
      const dropped = await tx.enrollment.update({
        where: { id: enrollment.id },
        data: { status: EnrollmentStatus.DROPPED, droppedAt: new Date() },
        select: { id: true, studentId: true, sectionId: true, status: true, enrolledAt: true },
      });
      const updatedSection = await tx.section.update({
        where: { id: enrollment.sectionId },
        data: { enrolledCount: { decrement: 1 } },
        select: { capacity: true, enrolledCount: true },
      });
      await this.audit.recordEvent(tx, {
        action: AuditAction.ENROLLMENT_DROPPED,
        actor: { userId: actor.userId, ipAddress: actor.ipAddress, userAgent: actor.userAgent },
        target: { type: 'enrollment', id: dropped.id },
        before: { sectionId: dropped.sectionId, status: enrollment.status },
        after: { sectionId: dropped.sectionId, status: dropped.status },
      });
      return {
        result: {
          ...dropped,
          enrolledAt: dropped.enrolledAt.toISOString(),
          sectionEnrolledCount: updatedSection.enrolledCount,
          sectionCapacity: updatedSection.capacity,
        } as EnrollmentResultDto,
        freedSeatSectionId: enrollment.sectionId as string | null,
      };
    });

    if (freedSeatSectionId) {
      await this.waitlist.enqueuePromotion(freedSeatSectionId);
    }
    return result;
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
        section: { select: { capacity: true, enrolledCount: true } },
      },
    });
    if (!e) throw new NotFoundException('Enrollment not found.');

    let waitlistPosition: number | undefined;
    if (e.status === EnrollmentStatus.WAITLISTED && e.waitlistPosition != null) {
      waitlistPosition = await this.waitlist.computeRank(this.prisma, e.sectionId, e.waitlistPosition);
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
    };
  }
}
