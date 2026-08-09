'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { CourseListItem, CourseDetail } from '@enroll/shared';

import { apiFetch } from '@/lib/api/client';
import { deptLabel, DEPT_IMAGES, DEPT_COLORS } from '@/lib/departments';
import { CatalogTable } from './catalog-table';

function DepartmentSection({
  dept,
  courses,
  showHeader,
  selectedId,
  onSelect,
}: {
  dept: string;
  courses: CourseListItem[];
  showHeader: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
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
        <CatalogTable courses={courses} selectedId={selectedId} onSelect={onSelect} />
      </div>
    </section>
  );
}

export function CatalogWorkspace({
  flatCourses,
  groups,
  enrolledCredits,
}: {
  flatCourses: CourseListItem[] | null;
  groups: [string, CourseListItem[]][] | null;
  enrolledCredits: number;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CourseDetail | null>(null);

  useEffect(() => {
    if (!selectedId) return;

    let ignore = false;
    apiFetch<CourseDetail>(`/courses/${selectedId}`)
      .then((res: CourseDetail) => {
        if (!ignore) setDetail(res);
      })
      .catch(() => {
        if (!ignore) setDetail(null);
      });
    return () => {
      ignore = true;
    };
  }, [selectedId]);

  const selectedCourseListItem = flatCourses
    ? flatCourses.find((c) => c.id === selectedId)
    : groups
      ? groups.flatMap((g) => g[1]).find((c) => c.id === selectedId)
      : null;

  return (
    <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
      {/* Middle: Course Results */}
      <div className="space-y-6 lg:col-span-8">
        {groups ? (
          groups.map(([dept, courses]) => (
            <DepartmentSection
              key={dept}
              dept={dept}
              courses={courses}
              showHeader={groups.length > 1}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          ))
        ) : flatCourses ? (
          <CatalogTable
            courses={flatCourses}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        ) : null}
      </div>

      {/* Right: Schedule Impact Panel */}
      <div className="sticky top-6 lg:col-span-4">
        {selectedCourseListItem ? (
          <div className="rounded-sm border border-line bg-card p-5 shadow-sm">
            <h3 className="mb-1 font-display text-lg font-bold text-ink">
              Adding {selectedCourseListItem.code}
            </h3>
            <p className="mb-6 text-sm text-ink-soft">{selectedCourseListItem.title}</p>

            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <span className="text-sm text-ink-soft">Credits after add</span>
                <span className="font-mono text-sm font-medium text-ink">
                  {enrolledCredits + selectedCourseListItem.credits} / 18
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-line pb-3">
                <span className="text-sm text-ink-soft">Time conflicts</span>
                <span className="text-sm font-medium text-pine">None</span>
              </div>
              <div className="flex items-center justify-between border-b border-line pb-3">
                <span className="text-sm text-ink-soft">Prerequisites</span>
                <span className="text-sm font-medium text-pine">Met</span>
              </div>
              <div className="flex items-center justify-between border-b border-line pb-3">
                <span className="text-sm text-ink-soft">Open sections</span>
                <span className="font-mono text-sm font-medium text-ink">
                  {detail
                    ? detail.sections.filter((s) => s.seatsAvailable > 0).length
                    : '-'}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-line pb-3">
                <span className="text-sm text-ink-soft">Best fit</span>
                <span className="text-sm font-medium text-ink">
                  {detail && detail.sections.length > 0
                    ? detail.sections[0].meetingPattern || 'Online'
                    : '-'}
                </span>
              </div>
            </div>

            <div className="mt-6">
              <Link
                href={`/courses/${selectedId}`}
                className="flex w-full items-center justify-center rounded-sm bg-pine py-2 text-sm font-medium text-paper hover:bg-pine-dark transition-colors"
              >
                Review sections &rarr;
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex h-64 flex-col items-center justify-center rounded-sm border border-dashed border-line p-6 text-center">
            <svg
              viewBox="0 0 24 24"
              width="32"
              height="32"
              fill="none"
              stroke="currentColor"
              className="mb-4 text-line-strong"
              strokeWidth="1.5"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 3v18M15 3v18" />
            </svg>
            <p className="text-sm text-ink-soft">
              Select a course to view its schedule impact.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
