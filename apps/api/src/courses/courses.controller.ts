import { CacheInterceptor } from '@nestjs/cache-manager';
import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/types/jwt-payload.interface';
import { CoursesService } from './courses.service';
import { CourseDetailDto, ListCoursesQueryDto, PaginatedCoursesResponseDto } from './dto';

@ApiTags('courses')
@UseGuards(JwtAuthGuard)
@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  /**
   * List courses with filter, search, and pagination.
   *
   * The cache key is derived from the full query string by NestJS, so
   * different filter combinations get distinct entries. TTL comes from
   * CATALOG_CACHE_TTL_MS (15s by default), short because the rows carry
   * live seat counts; admin capacity edits evict immediately via
   * CatalogCacheService.
   */
  @Get()
  @UseInterceptors(CacheInterceptor)
  @ApiOperation({ summary: 'List courses' })
  @ApiOkResponse({ type: PaginatedCoursesResponseDto })
  list(@Query() query: ListCoursesQueryDto): Promise<PaginatedCoursesResponseDto> {
    return this.coursesService.listCourses(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a course with sections for the active term',
    description:
      "Student viewers additionally get their own standing per section (viewerEnrollment). This route is uncached on purpose; see the list endpoint's CacheInterceptor note.",
  })
  @ApiOkResponse({ type: CourseDetailDto })
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<CourseDetailDto> {
    return this.coursesService.getCourse(id, {
      userId: user.sub,
      isStudent: user.roles?.includes('STUDENT') ?? false,
    });
  }
}
