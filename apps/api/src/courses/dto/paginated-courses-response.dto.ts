import { ApiProperty } from '@nestjs/swagger';

import type { PaginatedCoursesResponse } from '@enroll/shared';

import { CourseListItemDto } from './course-list-item.dto';

/** Standard envelope for the course list endpoint. */
export class PaginatedCoursesResponseDto implements PaginatedCoursesResponse {
  @ApiProperty({ type: [CourseListItemDto] })
  data!: CourseListItemDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  totalPages!: number;
}
