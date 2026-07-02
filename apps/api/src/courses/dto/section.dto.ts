import { ApiProperty } from '@nestjs/swagger';

import { EnrollmentStatus } from '@enroll/shared';
import type { Section, ViewerEnrollment } from '@enroll/shared';

/**
 * The viewing student's standing in a section. Status is the shared
 * enum (not Prisma's nominally-distinct twin); the service casts once
 * when it builds this object.
 */
export class ViewerEnrollmentDto implements ViewerEnrollment {
  @ApiProperty({ format: 'uuid' })
  enrollmentId!: string;

  @ApiProperty({ enum: EnrollmentStatus, description: 'ENROLLED, WAITLISTED, or COMPLETED.' })
  status!: EnrollmentStatus;

  @ApiProperty({
    required: false,
    description: '1-based waitlist rank; present only when status is WAITLISTED.',
  })
  waitlistPosition?: number;
}

/** Section as exposed by the catalog read path. */
export class SectionDto implements Section {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: '001' })
  sectionNumber!: string;

  @ApiProperty()
  instructorName!: string;

  @ApiProperty({ example: 'MWF 9:00-9:50' })
  meetingPattern!: string;

  @ApiProperty({ example: 'Olmsted 1129' })
  room!: string;

  @ApiProperty()
  capacity!: number;

  @ApiProperty()
  enrolledCount!: number;

  @ApiProperty({ description: 'capacity - enrolledCount, never negative.' })
  seatsAvailable!: number;

  @ApiProperty({ description: 'Students currently WAITLISTED for this section.' })
  waitlistCount!: number;

  @ApiProperty({ nullable: true, type: Number, description: 'null = unlimited, 0 = waitlist disabled.' })
  waitlistCap!: number | null;

  @ApiProperty({
    required: false,
    nullable: true,
    type: ViewerEnrollmentDto,
    description:
      "The authenticated student's standing in this section; null when they have none, omitted for non-student viewers.",
  })
  viewerEnrollment?: ViewerEnrollmentDto | null;
}
