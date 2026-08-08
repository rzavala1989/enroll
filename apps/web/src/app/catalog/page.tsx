import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DEPARTMENT_LABELS } from '@enroll/shared';
import type { CourseListItem, PaginatedCoursesResponse } from '@enroll/shared';

import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { SeatMeter } from '@/components/ui/seat-meter';
import { apiGet } from '@/lib/api/server';
import { parseCatalogParams, serializeCatalogParams } from '@/lib/catalog-params';
import { deptFromCode, deptLabel, DEPT_IMAGES, DEPT_COLORS } from '@/lib/departments';
import { seatStatus } from '@/lib/seat-status';

import { Pagination } from './pagination';
import { SearchControls } from './search-controls';

export const metadata: Metadata = { title: 'Catalog' };

const statusLabel = {
  open: 'Open',
  'nearly-full': 'Filling',
  full: 'Full',
} as const;

const statusTone = {
  open: 'open',
  'nearly-full': 'amber',
  full: 'full',
} as const;

function groupByDepartment(courses: CourseListItem[]): [string, CourseListItem[]][] {
  const groups: Map<string, CourseListItem[]> = new Map();
  for (const c of courses) {
    const dept = deptFromCode(c.code);
    const list = groups.get(dept);
    if (list) list.push(c);
    else groups.set(dept, [c]);
  }
  return Array.from(groups.entries());
}

function CourseRow({ course }: { course: CourseListItem }) {
  const open = Math.max(course.totalCapacity - course.totalEnrolled, 0);
  const status = seatStatus(open, course.totalCapacity);

  return (
    <Link
      href={`/courses/${course.id}`}
      className="group flex items-center gap-x-4 px-4 py-3 transition-colors hover:bg-pine-soft/40"
    >
      <span className="w-24 shrink-0 font-mono text-sm font-semibold text-pine">
        {course.code}
      </span>
      <span className="min-w-0 flex-1 text-sm font-medium group-hover:text-pine">
        {course.title}
      </span>
      <span className="hidden shrink-0 font-mono text-xs tabular-nums text-ink-soft sm:inline">
        {course.credits} cr
      </span>
      <span className="hidden shrink-0 text-xs text-ink-soft md:inline">
        {course.sectionCount} {course.sectionCount === 1 ? 'sec' : 'secs'}
      </span>
      <SeatMeter enrolled={course.totalEnrolled} capacity={course.totalCapacity} />
      <Badge tone={statusTone[status]}>{statusLabel[status]}</Badge>
    </Link>
  );
}

function DepartmentSection({
  dept,
  courses,
  showHeader,
}: {
  dept: string;
  courses: CourseListItem[];
  showHeader: boolean;
}) {
  const image = DEPT_IMAGES[dept];
  const color = DEPT_COLORS[dept] ?? 'var(--color-ink)';

  return (
    <section>
      {showHeader && (
        <div
          className="relative mb-px overflow-hidden rounded-t-sm"
          style={{ height: 72 }}
        >
          {image && (
            <Image
              src={image}
              alt=""
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-cover"
            />
          )}
          <div
            className="absolute inset-0 mix-blend-multiply"
            style={{ backgroundColor: color, opacity: 0.55 }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/50 to-transparent" />
          <div className="relative flex h-full items-end px-4 pb-2.5">
            <h2 className="font-display text-base font-semibold text-white">
              {deptLabel(dept)}
            </h2>
            <span className="ml-3 text-xs text-white/70">
              {courses.length} {courses.length === 1 ? 'course' : 'courses'}
            </span>
          </div>
        </div>
      )}
      <div
        className="divide-y divide-line overflow-hidden border border-line bg-card"
        style={{
          borderRadius: showHeader ? '0 0 3px 3px' : '3px',
          borderTopColor: showHeader ? color : undefined,
        }}
      >
        {courses.map((c) => (
          <CourseRow key={c.id} course={c} />
        ))}
      </div>
    </section>
  );
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseCatalogParams(await searchParams);
  const qs = serializeCatalogParams(params);
  const result = await apiGet<PaginatedCoursesResponse>(`/courses${qs ? `?${qs}` : ''}`);

  if (result.total > 0 && params.page > result.totalPages) {
    const lastQs = serializeCatalogParams({ ...params, page: result.totalPages });
    redirect(`/catalog${lastQs ? `?${lastQs}` : ''}`);
  }

  const hasFilters = Boolean(params.search || params.department);
  const useGrouping = !params.search;
  const groups = useGrouping ? groupByDepartment(result.data) : null;

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-pine-dark">Course catalog</h1>
      <SearchControls initial={params} />

      {result.data.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="No courses match these filters"
          body={
            hasFilters
              ? 'Every course in the current term was checked. Widen or drop a filter to see more.'
              : 'This term has no courses in the catalog yet. Once a registrar publishes sections, they appear here.'
          }
          facts={
            hasFilters
              ? [
                  ...(params.search
                    ? [
                        {
                          label: 'Search',
                          value: <span className="font-mono">{params.search}</span>,
                        },
                      ]
                    : []),
                  ...(params.department
                    ? [
                        {
                          label: 'Department',
                          value: `${DEPARTMENT_LABELS[params.department]} (${params.department})`,
                        },
                      ]
                    : []),
                ]
              : undefined
          }
          action={
            hasFilters && (
              <Link
                href="/catalog"
                className="inline-flex items-center rounded-sm border border-pine/40 px-3 py-1.5 text-sm font-medium text-pine transition-colors hover:border-pine hover:bg-pine-soft"
              >
                Clear all filters
              </Link>
            )
          }
        />
      ) : groups ? (
        <div className="mt-6 space-y-6">
          {groups.map(([dept, courses]) => (
            <DepartmentSection
              key={dept}
              dept={dept}
              courses={courses}
              showHeader={groups.length > 1}
            />
          ))}
        </div>
      ) : (
        <div className="mt-6 divide-y divide-line overflow-hidden rounded-sm border border-line bg-card">
          {result.data.map((c) => (
            <CourseRow key={c.id} course={c} />
          ))}
        </div>
      )}

      <Pagination params={params} total={result.total} totalPages={result.totalPages} />
    </div>
  );
}
