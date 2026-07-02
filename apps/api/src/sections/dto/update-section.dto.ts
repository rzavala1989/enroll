import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

import type { SectionSummary, UpdateSectionRequest } from '@enroll/shared';

export class UpdateSectionDto implements UpdateSectionRequest {
  @ApiProperty({
    required: false,
    minimum: 1,
    description: 'New seat capacity; must be at least the current enrolledCount.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  // @IsOptional also lets null through, which is exactly the
  // "clear the cap back to unlimited" signal.
  @ApiProperty({
    required: false,
    nullable: true,
    type: Number,
    minimum: 0,
    description: 'Max waitlist size; null = unlimited, 0 = waitlist disabled.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  waitlistCap?: number | null;
}

export class SectionSummaryDto implements SectionSummary {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: '001' })
  sectionNumber!: string;

  @ApiProperty({ format: 'uuid' })
  courseId!: string;

  @ApiProperty({ example: 'CS101' })
  courseCode!: string;

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
}
