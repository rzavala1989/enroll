import { ApiProperty } from '@nestjs/swagger';

import type { CourseListItem } from '@enroll/shared';

/** Single row in the paginated course list. */
export class CourseListItemDto implements CourseListItem {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'CS101' })
  code!: string;

  @ApiProperty({ example: 'Intro to Computer Science' })
  title!: string;

  @ApiProperty({ minimum: 1, example: 4 })
  credits!: number;

  @ApiProperty({ description: 'Sections offered in the active term.' })
  sectionCount!: number;

  @ApiProperty({ description: 'Sum of section capacities for the active term.' })
  totalCapacity!: number;

  @ApiProperty({
    description: 'Sum of section enrolled counts for the active term.',
  })
  totalEnrolled!: number;
}
