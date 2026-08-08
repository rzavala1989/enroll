import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Role } from '@enroll/shared';
import type { CourseDetail } from '@enroll/shared';

import { Badge } from '@/components/ui/badge';
import { apiGet } from '@/lib/api/server';
import { getIdentity } from '@/lib/identity';

import { SectionsTable } from './sections-table';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const [course, identity] = await Promise.all([
    apiGet<CourseDetail>(`/courses/${id}`),
    getIdentity(),
  ]);
  const roles = identity?.roles ?? [];
  const isStudent = roles.includes(Role.STUDENT);
  const isStaff = roles.includes(Role.ADMIN) || roles.includes(Role.ADVISOR);

  return (
    <div>
      <Link href="/catalog" className="text-xs text-pine underline">
        Back to catalog
      </Link>
      <div className="mt-2 flex items-baseline gap-3">
        <span className="font-mono text-lg font-bold text-pine">{course.code}</span>
        <Badge tone="neutral">{course.credits} credits</Badge>
      </div>
      <h1 className="font-display mt-1 text-3xl font-bold text-pine-dark">
        {course.title}
      </h1>
      {course.prerequisites.length > 0 && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="font-semibold text-ink-soft">Prerequisites:</span>
          <div className="flex flex-wrap gap-2">
            {course.prerequisites.map((p) => (
              <Link
                key={p.id}
                href={`/courses/${p.id}`}
                className="hover:opacity-80 transition-opacity"
              >
                <Badge tone="pine">{p.code}</Badge>
              </Link>
            ))}
          </div>
        </div>
      )}
      {course.description && (
        <p className="mt-3 max-w-2xl text-sm text-ink-soft">{course.description}</p>
      )}

      <h2 className="font-display mt-8 text-lg font-semibold">Sections</h2>
      <div className="mt-3">
        <SectionsTable
          sections={course.sections}
          courseCode={course.code}
          isStudent={isStudent}
          isStaff={isStaff}
        />
      </div>
    </div>
  );
}
