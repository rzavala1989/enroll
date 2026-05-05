import { ApiProperty } from '@nestjs/swagger';
import { EnrollmentStatus } from '@prisma/client';
import { IsUUID } from 'class-validator';

import type { EnrollFailureCode } from '@enroll/shared';

// Note: the response shapes match the shared `EnrollmentResult` and
// `EnrollFailure` interfaces structurally. We don't `implements` them
// here because Prisma's generated `EnrollmentStatus` enum is nominally
// distinct from the shared `EnrollmentStatus` (despite being string-
// equal at runtime), and forcing a cast every place we return Prisma
// data adds friction without real benefit. The web app consumes JSON
// where both enums are identical strings.

export class EnrollDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sectionId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  studentId!: string;
}

export class DropDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  studentId!: string;
}

export class EnrollmentResultDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  studentId!: string;

  @ApiProperty({ format: 'uuid' })
  sectionId!: string;

  @ApiProperty({ enum: EnrollmentStatus })
  status!: EnrollmentStatus;

  @ApiProperty()
  enrolledAt!: string;

  @ApiProperty()
  sectionEnrolledCount!: number;

  @ApiProperty()
  sectionCapacity!: number;
}

export class EnrollFailureDto {
  @ApiProperty({
    enum: [
      'SECTION_FULL',
      'ALREADY_ENROLLED',
      'REGISTRATION_CLOSED',
      'SECTION_NOT_FOUND',
      'STUDENT_NOT_FOUND',
    ],
  })
  code!: EnrollFailureCode;

  @ApiProperty()
  message!: string;
}
