import { ApiProperty } from '@nestjs/swagger';
import { EnrollmentStatus } from '@prisma/client';

// Matches the shared `MyEnrollment` interface structurally (same caveat
// as enroll.dto.ts: Prisma's EnrollmentStatus is nominally distinct).

export class MyEnrollmentSectionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  sectionNumber!: string;

  @ApiProperty()
  instructorName!: string;

  @ApiProperty()
  meetingPattern!: string;

  @ApiProperty()
  room!: string;
}

export class MyEnrollmentCourseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  credits!: number;
}

export class MyEnrollmentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: EnrollmentStatus })
  status!: EnrollmentStatus;

  @ApiProperty({ format: 'date-time' })
  enrolledAt!: string;

  @ApiProperty({
    required: false,
    description: '1-based waitlist position; absent unless status is WAITLISTED.',
  })
  waitlistPosition?: number;

  @ApiProperty({ type: MyEnrollmentSectionDto })
  section!: MyEnrollmentSectionDto;

  @ApiProperty({ type: MyEnrollmentCourseDto })
  course!: MyEnrollmentCourseDto;
}
