import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EnrollmentStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { DropDto, EnrollDto, EnrollmentResultDto } from './dto/enroll.dto';

@Injectable()
export class EnrollmentService {
  private readonly logger = new Logger(EnrollmentService.name);

  constructor(private readonly prisma: PrismaService) {}

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
  async enroll(input: EnrollDto): Promise<EnrollmentResultDto> {
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
        where: { id: input.studentId },
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

      if (live.enrolledCount >= live.capacity) {
        throw new ConflictException({
          code: 'SECTION_FULL',
          message: 'Section is at capacity.',
        });
      }

      // 4. Re-check ALREADY_ENROLLED inside the lock so the user-
      //    facing error is the right one. The unique index would also
      //    catch this (P2002), but a clean check returns a better
      //    error code without forcing the caller to parse Prisma errors.
      const existing = await tx.enrollment.findFirst({
        where: {
          studentId: input.studentId,
          sectionId: input.sectionId,
          status: EnrollmentStatus.ENROLLED,
        },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException({
          code: 'ALREADY_ENROLLED',
          message: 'Student is already enrolled in this section.',
        });
      }

      // 5. Insert + counter bump in the same transaction.
      const enrollment = await tx.enrollment.create({
        data: {
          studentId: input.studentId,
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

      return {
        ...enrollment,
        enrolledAt: enrollment.enrolledAt.toISOString(),
        sectionEnrolledCount: updated.enrolledCount,
        sectionCapacity: updated.capacity,
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
    input: DropDto,
  ): Promise<EnrollmentResultDto> {
    return this.prisma.$transaction(async (tx) => {
      const enrollment = await tx.enrollment.findUnique({
        where: { id: enrollmentId },
        select: {
          id: true,
          studentId: true,
          sectionId: true,
          status: true,
        },
      });
      if (!enrollment) {
        throw new NotFoundException('Enrollment not found.');
      }
      if (enrollment.studentId !== input.studentId) {
        // Phase 2 will replace this with a proper ABAC guard. For now
        // it's a server-side sanity check so a buggy client cannot drop
        // someone else's row.
        throw new BadRequestException(
          'Enrollment does not belong to this student.',
        );
      }
      if (enrollment.status !== EnrollmentStatus.ENROLLED) {
        throw new BadRequestException(
          `Cannot drop an enrollment in status ${enrollment.status}.`,
        );
      }

      // Lock the section row so the counter decrement serializes
      // against any concurrent enroll on the same section.
      await tx.$queryRaw`
        SELECT id FROM "Section"
        WHERE id = ${enrollment.sectionId}::uuid
        FOR UPDATE
      `;

      const dropped = await tx.enrollment.update({
        where: { id: enrollment.id },
        data: {
          status: EnrollmentStatus.DROPPED,
          droppedAt: new Date(),
        },
        select: {
          id: true,
          studentId: true,
          sectionId: true,
          status: true,
          enrolledAt: true,
        },
      });

      const updatedSection = await tx.section.update({
        where: { id: enrollment.sectionId },
        data: { enrolledCount: { decrement: 1 } },
        select: { capacity: true, enrolledCount: true },
      });

      return {
        ...dropped,
        enrolledAt: dropped.enrolledAt.toISOString(),
        sectionEnrolledCount: updatedSection.enrolledCount,
        sectionCapacity: updatedSection.capacity,
      };
    });
  }
}

// TODO(phase 6): when SECTION_FULL fires, instead of rejecting outright,
// create a WAITLISTED enrollment row and enqueue a BullMQ job for the
// next-in-line promotion when a seat opens (drop or admin override).
//
// TODO(phase 5): emit an audit event from the same transaction commit
// recording (actor, action, target, before, after). Mongo append-only
// collection, INSERT-only DB role.
