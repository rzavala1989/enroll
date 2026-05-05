import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  ALL_DEPARTMENTS,
  Department,
  type CourseSortBy,
  type ListCoursesQuery,
} from '@enroll/shared';

const SORT_BY_VALUES: readonly CourseSortBy[] = ['code', 'title', 'relevance'];

/**
 * Validated query params for `GET /api/courses`.
 *
 * Implements the shared {@link ListCoursesQuery} contract and adds
 * server-side validation: bounds on page/limit, enum membership for
 * sortBy and department, and a UUID check on termId.
 */
export class ListCoursesQueryDto implements ListCoursesQuery {
  @ApiPropertyOptional({
    description:
      'Term to list against. Defaults to the current open term on the server.',
  })
  @IsOptional()
  @IsUUID()
  termId?: string;

  @ApiPropertyOptional({
    enum: ALL_DEPARTMENTS,
    description: 'Filter by department code prefix (e.g. CS).',
  })
  @IsOptional()
  @IsEnum(Department)
  department?: Department;

  @ApiPropertyOptional({
    description:
      'Full-text search query across course code, title, and description.',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    enum: SORT_BY_VALUES,
    description:
      "Defaults to 'code', or 'relevance' when a search query is provided.",
  })
  @IsOptional()
  @IsEnum(SORT_BY_VALUES)
  sortBy?: CourseSortBy;
}
