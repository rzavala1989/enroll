import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EnrollmentStatus } from '@prisma/client';
import { AuditAction } from '@enroll/shared';

import { AuditService } from '../audit/audit.service';
import type { RequestActor } from '../enrollment/enrollment.service';
import { PrismaService } from '../prisma/prisma.service';
import { WaitlistService } from '../waitlist/waitlist.service';
import { SectionSummaryDto, UpdateSectionDto } from './dto/update-section.dto';

@Injectable()
export class SectionsService {
  private readonly logger = new Logger(SectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly waitlist: WaitlistService,
  ) {}

  async getSummary(sectionId: string): Promise<SectionSummaryDto> {
    const s = await this.prisma.section.findUnique({
      where: { id: sectionId },
      select: {
        id: true,
        sectionNumber: true,
        courseId: true,
        capacity: true,
        enrolledCount: true,
        waitlistCap: true,
        course: { select: { code: true } },
      },
    });
    if (!s) {
      throw new NotFoundException({
        code: 'SECTION_NOT_FOUND',
        message: 'Section does not exist.',
      });
    }
    const waitlistCount = await this.prisma.enrollment.count({
      where: { sectionId, status: EnrollmentStatus.WAITLISTED },
    });
    return this.toSummary(s, waitlistCount);
  }

  /**
   * Admin edit of capacity and/or waitlistCap.
   *
   * Runs under the section row lock (same discipline as enroll/drop)
   * so the capacity check cannot race a concurrent enrollment, and the
   * audit row commits atomically with the change. A capacity increase
   * enqueues the existing promotion sweep after commit, which fills
   * the new seats from the waitlist in position order.
   */
  async update(
    sectionId: string,
    dto: UpdateSectionDto,
    actor: RequestActor,
  ): Promise<SectionSummaryDto> {
    if (dto.capacity === undefined && dto.waitlistCap === undefined) {
      throw new BadRequestException({
        code: 'NO_FIELDS',
        message: 'Provide capacity, waitlistCap, or both.',
      });
    }

    const { summary, capacityIncreased } = await this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<
          Array<{ capacity: number; enrolledCount: number; waitlistCap: number | null }>
        >`
          SELECT capacity, "enrolledCount", "waitlistCap"
          FROM "Section"
          WHERE id = ${sectionId}::uuid
          FOR UPDATE
        `;
        const current = locked[0];
        if (!current) {
          throw new NotFoundException({
            code: 'SECTION_NOT_FOUND',
            message: 'Section does not exist.',
          });
        }

        const newCapacity = dto.capacity ?? current.capacity;
        if (newCapacity < current.enrolledCount) {
          throw new BadRequestException({
            code: 'CAPACITY_BELOW_ENROLLED',
            message: `Capacity ${newCapacity} is below the ${current.enrolledCount} students already enrolled.`,
          });
        }
        const newWaitlistCap =
          dto.waitlistCap === undefined ? current.waitlistCap : dto.waitlistCap;

        const updated = await tx.section.update({
          where: { id: sectionId },
          data: { capacity: newCapacity, waitlistCap: newWaitlistCap },
          select: {
            id: true,
            sectionNumber: true,
            courseId: true,
            capacity: true,
            enrolledCount: true,
            waitlistCap: true,
            course: { select: { code: true } },
          },
        });

        await this.audit.recordEvent(tx, {
          action: AuditAction.SECTION_UPDATED,
          actor: {
            userId: actor.userId,
            ipAddress: actor.ipAddress,
            userAgent: actor.userAgent,
          },
          target: { type: 'section', id: sectionId },
          before: { capacity: current.capacity, waitlistCap: current.waitlistCap },
          after: { capacity: newCapacity, waitlistCap: newWaitlistCap },
        });

        const waitlistCount = await tx.enrollment.count({
          where: { sectionId, status: EnrollmentStatus.WAITLISTED },
        });

        return {
          summary: this.toSummary(updated, waitlistCount),
          capacityIncreased: newCapacity > current.capacity,
        };
      },
    );

    if (capacityIncreased) {
      await this.waitlist.enqueuePromotion(sectionId);
    }
    return summary;
  }

  private toSummary(
    s: {
      id: string;
      sectionNumber: string;
      courseId: string;
      capacity: number;
      enrolledCount: number;
      waitlistCap: number | null;
      course: { code: string };
    },
    waitlistCount: number,
  ): SectionSummaryDto {
    return {
      id: s.id,
      sectionNumber: s.sectionNumber,
      courseId: s.courseId,
      courseCode: s.course.code,
      capacity: s.capacity,
      enrolledCount: s.enrolledCount,
      seatsAvailable: Math.max(0, s.capacity - s.enrolledCount),
      waitlistCount,
      waitlistCap: s.waitlistCap,
    };
  }
}
