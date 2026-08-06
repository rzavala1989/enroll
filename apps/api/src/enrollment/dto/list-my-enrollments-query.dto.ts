import { ApiPropertyOptional } from '@nestjs/swagger';
import { EnrollmentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Query for GET /enrollments.
 *
 * The endpoint used to return a student's entire history unbounded,
 * which is fine in year one and 200 rows for a graduating senior, every
 * one of them serialized on every visit to the enrollments page. Both
 * parameters are optional and the defaults preserve the old shape for
 * anyone already calling it.
 */
export class ListMyEnrollmentsQueryDto {
  @ApiPropertyOptional({
    enum: EnrollmentStatus,
    isArray: true,
    description:
      'Restrict to these statuses. Repeat the parameter for several (?status=ENROLLED&status=WAITLISTED).',
  })
  @IsOptional()
  @Type(() => String)
  @IsEnum(EnrollmentStatus, { each: true })
  status?: EnrollmentStatus | EnrollmentStatus[];

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 100;
}
