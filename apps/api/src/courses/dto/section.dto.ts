import { ApiProperty } from '@nestjs/swagger';

import type { Section } from '@enroll/shared';

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
}
