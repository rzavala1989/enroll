import type { Metadata } from 'next';
import Link from 'next/link';
import { EnrollmentStatus } from '@enroll/shared';
import type { MyEnrollment } from '@enroll/shared';

import { Badge } from '@/components/ui/badge';
import type { BadgeTone } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { apiGet } from '@/lib/api/server';
import { deptFromCode, deptLabel, DEPT_COLORS } from '@/lib/departments';

import { EnrollmentActions } from './enrollment-actions';

export const metadata: Metadata = { title: 'My enrollments' };

const statusTone: Record<EnrollmentStatus, BadgeTone> = {
  [EnrollmentStatus.ENROLLED]: 'open',
  [EnrollmentStatus.WAITLISTED]: 'wait',
  [EnrollmentStatus.DROPPED]: 'neutral',
  [EnrollmentStatus.COMPLETED]: 'pine',
};

function EnrollmentCard({
  enrollment,
  withActions,
}: {
  enrollment: MyEnrollment;
  withActions: boolean;
}) {
  const dept = deptFromCode(enrollment.course.code);

  return (
    <div className="flex flex-col overflow-hidden rounded-sm border border-line bg-card shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-mono text-sm font-semibold tracking-tight text-pine">
              {enrollment.course.code}
            </h2>
            <p className="font-display text-lg font-bold leading-tight text-ink">
              {enrollment.course.title}
            </p>
          </div>
          <Badge tone={statusTone[enrollment.status]}>{enrollment.status}</Badge>
        </div>

        <div className="mb-5 flex-1 space-y-1.5 text-sm text-ink-soft">
          <p className="flex items-center gap-2">
            <span className="font-medium text-ink">
              {enrollment.section.meetingPattern}
            </span>
            <span>&middot;</span>
            <span>{enrollment.section.room}</span>
          </p>
          <p className="flex items-center gap-2">
            <span>{enrollment.section.instructorName}</span>
            <span>&middot;</span>
            <span>{enrollment.course.credits} credits</span>
          </p>
        </div>

        <div className="mb-6 space-y-1 rounded bg-pine-soft/10 px-3 py-2.5 text-xs">
          <p className="flex items-center gap-2 font-semibold text-pine">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            No conflicts
          </p>
          <p className="ml-6 text-pine/80">Counts toward: {deptLabel(dept)} Major Core</p>
        </div>

        {withActions && (
          <div className="flex items-center gap-3">
            <Link
              href={`/courses/${enrollment.course.id}`}
              className="inline-flex h-8 items-center justify-center rounded-sm border border-line bg-paper px-4 text-xs font-medium text-ink transition-colors hover:bg-line/30"
            >
              View details
            </Link>
            <EnrollmentActions enrollmentId={enrollment.id} status={enrollment.status} />
          </div>
        )}
      </div>
      {enrollment.status === EnrollmentStatus.WAITLISTED &&
        enrollment.waitlistPosition != null && (
          <div className="bg-wait/10 px-5 py-2.5 text-xs font-semibold text-wait-strong">
            #{enrollment.waitlistPosition} in line
          </div>
        )}
    </div>
  );
}

function PastRow({ enrollment }: { enrollment: MyEnrollment }) {
  const dept = deptFromCode(enrollment.course.code);
  const color = DEPT_COLORS[dept] ?? 'var(--color-ink)';

  return (
    <div className="flex items-center gap-4 px-4 py-2.5">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <span className="w-20 shrink-0 font-mono text-sm font-semibold text-pine">
        {enrollment.course.code}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">{enrollment.course.title}</span>
      <span className="shrink-0 font-mono text-xs tabular-nums text-ink-soft">
        {enrollment.course.credits} cr
      </span>
      <Badge tone={statusTone[enrollment.status]}>{enrollment.status}</Badge>
    </div>
  );
}

export default async function EnrollmentsPage() {
  const rows = await apiGet<MyEnrollment[]>('/enrollments');
  const active = rows.filter(
    (e) =>
      e.status === EnrollmentStatus.ENROLLED || e.status === EnrollmentStatus.WAITLISTED,
  );
  const past = rows.filter(
    (e) =>
      e.status !== EnrollmentStatus.ENROLLED && e.status !== EnrollmentStatus.WAITLISTED,
  );

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-pine-dark">My enrollments</h1>

      {active.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="No active enrollments"
          body={
            past.length > 0
              ? 'Nothing is currently enrolled or waitlisted. Your past enrollments are below.'
              : 'Enroll in a section from the catalog. If it is already full you join its waitlist, and you are enrolled automatically when a seat opens.'
          }
          facts={
            past.length > 0
              ? [{ label: 'Past enrollments', value: past.length }]
              : undefined
          }
          action={
            <Link
              href="/catalog"
              className="inline-flex items-center rounded-sm border border-pine bg-pine px-3 py-1.5 text-sm font-medium text-paper transition-colors hover:bg-pine-dark"
            >
              Browse the catalog
            </Link>
          }
        />
      ) : (
        <>
          <p className="mt-2 text-sm text-ink-soft">
            {active.length} active {active.length === 1 ? 'course' : 'courses'}
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((e) => (
              <EnrollmentCard key={e.id} enrollment={e} withActions />
            ))}
          </div>
        </>
      )}

      {past.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm font-semibold text-ink-soft">
            Past enrollments ({past.length})
          </summary>
          <div className="mt-3 divide-y divide-line overflow-hidden rounded-sm border border-line bg-card">
            {past.map((e) => (
              <PastRow key={e.id} enrollment={e} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
