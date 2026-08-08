import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DEPARTMENT_LABELS } from '@enroll/shared';
import type { CourseListItem, PaginatedCoursesResponse } from '@enroll/shared';

import { EmptyState } from '@/components/ui/empty-state';
import { apiGet } from '@/lib/api/server';
import { parseCatalogParams, serializeCatalogParams } from '@/lib/catalog-params';
import { deptFromCode, deptLabel, DEPT_IMAGES, DEPT_COLORS } from '@/lib/departments';

import { CatalogTable } from './catalog-table';

import { Pagination } from './pagination';
import { SearchControls } from './search-controls';

export const metadata: Metadata = { title: 'Catalog' };

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
        className="overflow-hidden"
        style={{
          borderRadius: showHeader ? '0 0 3px 3px' : '3px',
        }}
      >
        <CatalogTable courses={courses} />
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
        <div className="mt-6">
          <CatalogTable courses={result.data} />
        </div>
      )}

      <Pagination params={params} total={result.total} totalPages={result.totalPages} />
    </div>
  );
}
