import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  CourseDetailDto,
  CourseListItemDto,
  ListCoursesQueryDto,
  PaginatedCoursesResponseDto,
  SectionDto,
} from './dto';

/** Shape returned by the FTS raw query. Snake-case columns match Postgres. */
interface FtsRow {
  id: string;
  rank: number;
}

@Injectable()
export class CoursesService {
  private readonly logger = new Logger(CoursesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Paginated, filterable, optionally full-text-searched course list.
   *
   * The list is always scoped to a single term: either the explicit
   * `termId` from the query or the current open term resolved from the
   * registration window. Section aggregates (count, total capacity,
   * total enrolled) are computed in a single Prisma query via
   * `include: { sections: { where: { termId } } }` so we never N+1 over
   * courses to count their sections.
   *
   * Search uses Postgres full-text search through a generated tsvector
   * column on `Course` (see migration `20260428070000_add_course_fts`).
   * `to_tsquery` parses the search string with `:*` suffixes for prefix
   * matching, and `ts_rank` orders results by relevance when sortBy is
   * `'relevance'` (the default whenever a search query is present).
   */
  async listCourses(
    query: ListCoursesQueryDto,
  ): Promise<PaginatedCoursesResponseDto> {
    const termId = query.termId ?? (await this.resolveActiveTermId());
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sortBy = query.sortBy ?? (query.search ? 'relevance' : 'code');

    // Departments map directly to a code prefix.
    const codePrefix = query.department ? `${query.department}` : undefined;

    // Step 1: when search is provided, rank candidate courses by FTS
    // and reduce to a set of ids + their relevance scores. Without
    // search, we skip this branch and use a plain Prisma findMany.
    let searchIds: string[] | undefined;
    let rankById: Map<string, number> | undefined;

    if (query.search && query.search.trim().length > 0) {
      const tsquery = this.toTsQuery(query.search);

      // Pull a generous candidate window so the in-memory sort below has
      // enough rows to paginate cleanly. 500 is plenty for a UCR-sized
      // catalog and keeps the query time deterministic.
      const ftsRows = await this.prisma.$queryRaw<FtsRow[]>(
        Prisma.sql`
          SELECT
            c.id,
            ts_rank(c."searchVector", to_tsquery('english', ${tsquery})) AS rank
          FROM "Course" c
          WHERE c."searchVector" @@ to_tsquery('english', ${tsquery})
            ${
              codePrefix
                ? Prisma.sql`AND c."code" LIKE ${codePrefix + '%'}`
                : Prisma.empty
            }
          ORDER BY rank DESC
          LIMIT 500
        `,
      );

      searchIds = ftsRows.map((r) => r.id);
      rankById = new Map(ftsRows.map((r) => [r.id, Number(r.rank)]));

      if (searchIds.length === 0) {
        return { data: [], page, limit, total: 0, totalPages: 0 };
      }
    }

    // Step 2: count + fetch the page of courses with their sections for
    // the active term. Prisma resolves both in parallel via $transaction.
    const where: Prisma.CourseWhereInput = {
      ...(searchIds ? { id: { in: searchIds } } : {}),
      ...(codePrefix && !searchIds
        ? { code: { startsWith: codePrefix } }
        : {}),
    };

    const orderBy: Prisma.CourseOrderByWithRelationInput | undefined =
      sortBy === 'title'
        ? { title: 'asc' }
        : sortBy === 'code'
          ? { code: 'asc' }
          : undefined; // relevance: we sort in memory below

    const [total, courses] = await this.prisma.$transaction([
      this.prisma.course.count({ where }),
      this.prisma.course.findMany({
        where,
        orderBy,
        // For non-search results the DB does pagination. For search we
        // still need every matched id in order to relevance-sort below,
        // so we skip take/skip here and slice in memory.
        ...(searchIds
          ? {}
          : { skip: (page - 1) * limit, take: limit }),
        include: {
          sections: {
            where: { termId },
            select: { capacity: true, enrolledCount: true },
          },
        },
      }),
    ]);

    let rows = courses;
    if (searchIds && rankById) {
      // Re-sort by FTS rank (Postgres returned them ranked, but Prisma
      // re-ordered by id when we used `where: { id: { in } }`).
      rows = [...rows].sort(
        (a, b) => (rankById!.get(b.id) ?? 0) - (rankById!.get(a.id) ?? 0),
      );
      rows = rows.slice((page - 1) * limit, (page - 1) * limit + limit);
    }

    const data: CourseListItemDto[] = rows.map((c) => ({
      id: c.id,
      code: c.code,
      title: c.title,
      credits: c.credits,
      sectionCount: c.sections.length,
      totalCapacity: c.sections.reduce((sum, s) => sum + s.capacity, 0),
      totalEnrolled: c.sections.reduce((sum, s) => sum + s.enrolledCount, 0),
    }));

    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * Single course with sections for the active (or specified) term.
   *
   * @param id - Course UUID.
   * @param termId - Optional term to filter sections by; defaults to
   *   the current open term.
   */
  async getCourse(id: string, termId?: string): Promise<CourseDetailDto> {
    const activeTermId = termId ?? (await this.resolveActiveTermId());

    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        sections: {
          where: { termId: activeTermId },
          orderBy: { sectionNumber: 'asc' },
        },
      },
    });

    if (!course) {
      throw new NotFoundException(`Course ${id} not found`);
    }

    const sections: SectionDto[] = course.sections.map((s) => ({
      id: s.id,
      sectionNumber: s.sectionNumber,
      instructorName: s.instructorName,
      meetingPattern: s.meetingPattern,
      room: s.room,
      capacity: s.capacity,
      enrolledCount: s.enrolledCount,
      seatsAvailable: Math.max(0, s.capacity - s.enrolledCount),
    }));

    return {
      id: course.id,
      code: course.code,
      title: course.title,
      description: course.description,
      credits: course.credits,
      sections,
    };
  }

  /**
   * Resolve the term whose registration window currently contains
   * `now`. If multiple terms are open, the most recent one wins.
   *
   * Throws NotFoundException if no term is open; clients can pass an
   * explicit termId in that case.
   */
  private async resolveActiveTermId(): Promise<string> {
    const now = new Date();
    const term = await this.prisma.term.findFirst({
      where: {
        registrationOpens: { lte: now },
        registrationCloses: { gte: now },
      },
      orderBy: { startDate: 'desc' },
      select: { id: true },
    });
    if (!term) {
      throw new NotFoundException(
        'No term is currently open for registration. Pass an explicit termId.',
      );
    }
    return term.id;
  }

  /**
   * Translate a free-text search query into a Postgres `to_tsquery`
   * expression with prefix matching and AND semantics.
   *
   * Example: `intro algo` becomes `intro:* & algo:*`. Strips characters
   * that would break tsquery parsing (parens, quotes, operators).
   */
  private toTsQuery(input: string): string {
    const tokens = input
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 0)
      .map((t) => `${t}:*`);
    if (tokens.length === 0) return '';
    return tokens.join(' & ');
  }
}

// TODO(phase 4): when admin write endpoints land (Course/Section CRUD),
// invalidate the CacheModule entries for `GET /api/courses` from those
// handlers. Two options worth considering:
//  1. Wildcard-evict any cache key whose query touches the mutated
//     course/section (simplest; good for low write volume).
//  2. Subscribe to a domain event (CourseUpdated, SectionUpdated) on
//     a NestJS EventEmitter and let the cache layer listen.
// For now the 5-minute TTL is the only invalidation mechanism.
