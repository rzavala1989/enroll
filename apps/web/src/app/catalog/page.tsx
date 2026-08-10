import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DEPARTMENT_LABELS } from '@enroll/shared';
import type {
  CourseListItem,
  PaginatedCoursesResponse,
  StudentProfile,
  MyEnrollment,
} from '@enroll/shared';

import { EmptyState } from '@/components/ui/empty-state';
import { apiGet } from '@/lib/api/server';
import { parseCatalogParams, serializeCatalogParams } from '@/lib/catalog-params';
import { deptFromCode } from '@/lib/departments';

import { CatalogWorkspace } from './catalog-workspace';
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

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseCatalogParams(await searchParams);
  const qs = serializeCatalogParams(params);

  const [result, profile, myEnrollments] = await Promise.all([
    apiGet<PaginatedCoursesResponse>(`/courses${qs ? `?${qs}` : ''}`),
    apiGet<StudentProfile>('/auth/profile').catch(() => null),
    apiGet<MyEnrollment[]>('/enrollments').catch(() => []),
  ]);

  if (result.total > 0 && params.page > result.totalPages) {
    const lastQs = serializeCatalogParams({ ...params, page: result.totalPages });
    redirect(`/catalog${lastQs ? `?${lastQs}` : ''}`);
  }

  const hasFilters = Boolean(params.search || params.department);
  const useGrouping = !params.search;
  const groups = useGrouping ? groupByDepartment(result.data) : null;
  const enrolledCredits = profile?.currentTerm?.enrolledCredits ?? 0;
  const holds = profile?.holds ?? [];

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
              : 'This term has no courses in the catalog yet.'
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
      ) : (
        <CatalogWorkspace
          flatCourses={groups ? null : result.data}
          groups={groups}
          enrolledCredits={enrolledCredits}
          enrollments={myEnrollments}
          holds={holds}
        />
      )}

      <Pagination params={params} total={result.total} totalPages={result.totalPages} />
    </div>
  );
}
