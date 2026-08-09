'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import type { CourseListItem, CourseDetail } from '@enroll/shared';

import { apiFetch } from '@/lib/api/client';
import { deptLabel, DEPT_IMAGES, DEPT_COLORS } from '@/lib/departments';
import { CatalogTable } from './catalog-table';
import { CourseDetailDrawer } from './course-detail-drawer';

function DepartmentSection({
  dept,
  courses,
  showHeader,
  selectedId,
  onSelect,
  enrolledCredits,
}: {
  dept: string;
  courses: CourseListItem[];
  showHeader: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  enrolledCredits?: number;
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
        <CatalogTable
          courses={courses}
          selectedId={selectedId}
          onSelect={onSelect}
          enrolledCredits={enrolledCredits}
        />
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
              enrolledCredits={enrolledCredits}
            />
          ))
        ) : flatCourses ? (
          <CatalogTable
            courses={flatCourses}
            selectedId={selectedId}
            onSelect={setSelectedId}
            enrolledCredits={enrolledCredits}
          />
        ) : null}
      </div>

      {/* Right: Schedule Impact Panel */}
      <div className="sticky top-6 lg:col-span-4">
        {selectedCourseListItem ? (
          <CourseDetailDrawer
            listItem={selectedCourseListItem}
            detail={detail}
            enrolledCredits={enrolledCredits}
          />
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
              Select a course to view sections and impact.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
