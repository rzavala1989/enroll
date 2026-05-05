import { ApiProperty } from '@nestjs/swagger';

import type { CourseDetail } from '@enroll/shared';

import { SectionDto } from './section.dto';

/** Full course detail with sections for the active term. */
export class CourseDetailDto implements CourseDetail {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'CS101' })
  code!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty()
  credits!: number;

  @ApiProperty({ type: [SectionDto] })
  sections!: SectionDto[];
}
