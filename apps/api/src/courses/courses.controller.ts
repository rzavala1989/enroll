import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CoursesService } from './courses.service';
import {
  CourseDetailDto,
  ListCoursesQueryDto,
  PaginatedCoursesResponseDto,
} from './dto';

@ApiTags('courses')
@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  /**
   * List courses with filter, search, and pagination.
   *
   * The cache key is derived from the full query string by NestJS, so
   * different filter combinations get distinct entries. TTL is 5
   * minutes; admin write endpoints in a future phase should evict
   * relevant entries (see TODO at the bottom of CoursesService).
   */
  @Get()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300_000)
  @ApiOperation({ summary: 'List courses' })
  @ApiOkResponse({ type: PaginatedCoursesResponseDto })
  list(
    @Query() query: ListCoursesQueryDto,
  ): Promise<PaginatedCoursesResponseDto> {
    return this.coursesService.listCourses(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a course with sections for the active term' })
  @ApiOkResponse({ type: CourseDetailDto })
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<CourseDetailDto> {
    return this.coursesService.getCourse(id);
  }
}
