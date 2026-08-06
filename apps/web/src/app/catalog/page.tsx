import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DEPARTMENT_LABELS } from '@enroll/shared';
import type { PaginatedCoursesResponse } from '@enroll/shared';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { apiGet } from '@/lib/api/server';
import { parseCatalogParams, serializeCatalogParams } from '@/lib/catalog-params';
import { seatStatus } from '@/lib/seat-status';

import { Pagination } from './pagination';
import { SearchControls } from './search-controls';

export const metadata: Metadata = { title: 'Catalog' };

const seatTone = { open: 'open', 'nearly-full': 'amber', full: 'full' } as const;

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseCatalogParams(await searchParams);
  const qs = serializeCatalogParams(params);
  const result = await apiGet<PaginatedCoursesResponse>(`/courses${qs ? `?${qs}` : ''}`);

  // A hand-edited or stale page past the end returns an empty list while total
  // stays correct; clamp to the last real page instead of showing "Page 9 of 3".
  if (result.total > 0 && params.page > result.totalPages) {
    const lastQs = serializeCatalogParams({ ...params, page: result.totalPages });
    redirect(`/catalog${lastQs ? `?${lastQs}` : ''}`);
  }

  const hasFilters = Boolean(params.search || params.department);

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
          // The filters that produced the empty result, so the user can
          // see which one to loosen instead of guessing.
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
        <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {result.data.map((course) => {
            const open = course.totalCapacity - course.totalEnrolled;
            const status = seatStatus(open, course.totalCapacity);
            return (
              <li key={course.id}>
                <Link href={`/courses/${course.id}`} className="block h-full">
                  <Card className="h-full transition-colors hover:border-pine">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-sm font-bold text-pine">
                        {course.code}
                      </span>
                      <Badge tone="neutral">{course.credits} cr</Badge>
                    </div>
                    <p className="font-display mt-1 font-semibold">{course.title}</p>
                    <p className="mt-2 flex items-center gap-2 text-xs text-ink-soft">
                      {course.sectionCount} section{course.sectionCount === 1 ? '' : 's'}
                      <Badge tone={seatTone[status]}>
                        {status === 'full' ? 'Full' : `${open} open`}
                      </Badge>
                    </p>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Pagination params={params} total={result.total} totalPages={result.totalPages} />
    </div>
  );
}
