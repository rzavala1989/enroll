import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EnrollmentStatus, Prisma } from '@prisma/client';
import type { EnrollmentStatus as SharedEnrollmentStatus } from '@enroll/shared';

import { PrismaService } from '../prisma/prisma.service';
import { WaitlistService } from '../waitlist/waitlist.service';
import {
  CourseDetailDto,
  CourseListItemDto,
  ListCoursesQueryDto,
  PaginatedCoursesResponseDto,
  SectionDto,
  ViewerEnrollmentDto,
} from './dto';

/** Shape returned by the FTS raw query. Snake-case columns match Postgres. */
interface FtsRow {
  id: string;
  rank: number;
}

/** Who is looking at the course detail; drives viewerEnrollment. */
export interface CourseViewer {
  userId: string;
  isStudent: boolean;
}

/**
 * How many ranked matches to pull for the in-memory relevance sort.
 * Deep pages of a very broad search fall outside it; the reported total
 * is the true match count either way.
 */
const FTS_CANDIDATE_WINDOW = 500;

/** Lower index wins when a student has several rows for one section. */
const VIEWER_STATUS_PRECEDENCE: EnrollmentStatus[] = [
  EnrollmentStatus.ENROLLED,
  EnrollmentStatus.WAITLISTED,
  EnrollmentStatus.COMPLETED,
];

@Injectable()
export class CoursesService {
  private readonly logger = new Logger(CoursesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly waitlist: WaitlistService,
  ) {}

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
  async listCourses(query: ListCoursesQueryDto): Promise<PaginatedCoursesResponseDto> {
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
    let searchTotal: number | undefined;

    if (query.search && query.search.trim().length > 0) {
      const tsquery = this.toTsQuery(query.search);
      const departmentFilter = codePrefix
        ? Prisma.sql`AND c."code" LIKE ${codePrefix + '%'}`
        : Prisma.empty;

      /**
       * The candidate window bounds the in-memory relevance sort below.
       * The match count must not be bounded with it: counting the
       * windowed ids reported `total: 500` for a query matching 600
       * courses, so the last pages of a broad search were unreachable
       * and the page count was a lie. Count the whole match set,
       * paginate the window.
       */
      const [ftsRows, [{ count }]] = await this.prisma.$transaction([
        this.prisma.$queryRaw<FtsRow[]>(
          Prisma.sql`
            SELECT
              c.id,
              ts_rank(c."searchVector", to_tsquery('english', ${tsquery})) AS rank
            FROM "Course" c
            WHERE c."searchVector" @@ to_tsquery('english', ${tsquery})
              ${departmentFilter}
            ORDER BY rank DESC
            LIMIT ${FTS_CANDIDATE_WINDOW}
          `,
        ),
        this.prisma.$queryRaw<Array<{ count: bigint }>>(
          Prisma.sql`
            SELECT count(*)::bigint AS count
            FROM "Course" c
            WHERE c."searchVector" @@ to_tsquery('english', ${tsquery})
              ${departmentFilter}
          `,
        ),
      ]);

      searchIds = ftsRows.map((r) => r.id);
      rankById = new Map(ftsRows.map((r) => [r.id, Number(r.rank)]));
      searchTotal = Number(count);

      if (searchIds.length === 0) {
        return { data: [], page, limit, total: 0, totalPages: 0 };
      }
    }

    // Step 2: count + fetch the page of courses with their sections for
    // the active term. Prisma resolves both in parallel via $transaction.
    const where: Prisma.CourseWhereInput = {
      ...(searchIds ? { id: { in: searchIds } } : {}),
      ...(codePrefix && !searchIds ? { code: { startsWith: codePrefix } } : {}),
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
        ...(searchIds ? {} : { skip: (page - 1) * limit, take: limit }),
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

    // For a search, `total` from the id-restricted count is capped by
    // the candidate window; the raw count of the full match set is the
    // honest number.
    const reportedTotal = searchTotal ?? total;

    return {
      data,
      page,
      limit,
      total: reportedTotal,
      totalPages: Math.max(1, Math.ceil(reportedTotal / limit)),
    };
  }

  /**
   * Single course with sections for the active (or specified) term.
   *
   * When the viewer is a student, each section carries their own
   * standing (viewerEnrollment) so the UI can render "Enrolled" or
   * "Waitlisted #N" instead of a live Enroll button. Non-student
   * viewers get no viewerEnrollment key at all. This route is
   * deliberately uncached (only the list endpoint sits behind the
   * CacheInterceptor), so per-viewer data cannot leak across users.
   *
   * @param id - Course UUID.
   * @param viewer - The authenticated requester; drives viewerEnrollment.
   * @param termId - Optional term to filter sections by; defaults to
   *   the current open term.
   */
  async getCourse(
    id: string,
    viewer?: CourseViewer,
    termId?: string,
  ): Promise<CourseDetailDto> {
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

    const sectionIds = course.sections.map((s) => s.id);
    const waitlistCounts = await this.countWaitlisted(sectionIds);
    const viewerBySection =
      viewer?.isStudent && sectionIds.length > 0
        ? await this.resolveViewerEnrollments(viewer.userId, sectionIds)
        : undefined;

    const sections: SectionDto[] = course.sections.map((s) => ({
      id: s.id,
      sectionNumber: s.sectionNumber,
      instructorName: s.instructorName,
      meetingPattern: s.meetingPattern,
      room: s.room,
      capacity: s.capacity,
      enrolledCount: s.enrolledCount,
      seatsAvailable: Math.max(0, s.capacity - s.enrolledCount),
      waitlistCount: waitlistCounts.get(s.id) ?? 0,
      waitlistCap: s.waitlistCap,
      ...(viewerBySection ? { viewerEnrollment: viewerBySection.get(s.id) ?? null } : {}),
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

  /** WAITLISTED row count per section, one groupBy for the whole page. */
  private async countWaitlisted(sectionIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (sectionIds.length === 0) return counts;
    const grouped = await this.prisma.enrollment.groupBy({
      by: ['sectionId'],
      where: {
        sectionId: { in: sectionIds },
        status: EnrollmentStatus.WAITLISTED,
      },
      _count: { _all: true },
    });
    for (const g of grouped) counts.set(g.sectionId, g._count._all);
    return counts;
  }

  /**
   * The viewing student's best row per section. Precedence ENROLLED >
   * WAITLISTED > COMPLETED (ties broken by newest enrolledAt via the
   * query order); DROPPED rows are excluded so a student who dropped
   * sees a live Enroll button again.
   */
  private async resolveViewerEnrollments(
    userId: string,
    sectionIds: string[],
  ): Promise<Map<string, ViewerEnrollmentDto>> {
    const rows = await this.prisma.enrollment.findMany({
      where: {
        studentId: userId,
        sectionId: { in: sectionIds },
        status: { in: VIEWER_STATUS_PRECEDENCE },
      },
      orderBy: { enrolledAt: 'desc' },
      select: { id: true, sectionId: true, status: true, waitlistPosition: true },
    });

    const best = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const current = best.get(row.sectionId);
      if (
        !current ||
        VIEWER_STATUS_PRECEDENCE.indexOf(row.status) <
          VIEWER_STATUS_PRECEDENCE.indexOf(current.status)
      ) {
        best.set(row.sectionId, row);
      }
    }

    // Batched: a student waitlisted for several sections of one course
    // used to cost a count query per section on the detail page.
    const ranks = await this.waitlist.computeRanks(
      this.prisma,
      [...best.values()]
        .filter(
          (row) =>
            row.status === EnrollmentStatus.WAITLISTED && row.waitlistPosition != null,
        )
        .map((row) => ({
          id: row.id,
          sectionId: row.sectionId,
          waitlistPosition: row.waitlistPosition as number,
        })),
    );

    const out = new Map<string, ViewerEnrollmentDto>();
    for (const [sectionId, row] of best) {
      out.set(sectionId, {
        enrollmentId: row.id,
        // Prisma's EnrollmentStatus is nominally distinct from the
        // shared enum despite identical string values; cast once here.
        status: row.status as string as SharedEnrollmentStatus,
        waitlistPosition: ranks.get(row.id),
      });
    }
    return out;
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
