import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { EnrollmentStatus } from '@enroll/shared';
import type { MyEnrollment } from '@enroll/shared';

import { Badge } from '@/components/ui/badge';
import type { BadgeTone } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { apiGet } from '@/lib/api/server';
import { deptFromCode, DEPT_IMAGES, DEPT_COLORS } from '@/lib/departments';

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
  const image = DEPT_IMAGES[dept];
  const color = DEPT_COLORS[dept] ?? 'var(--color-ink)';

  return (
    <div className="group overflow-hidden rounded-sm border border-line bg-card transition-colors hover:border-pine/40">
      <Link
        href={`/courses/${enrollment.course.id}`}
        className="relative block"
        style={{ height: 100 }}
      >
        {image && (
          <Image
            src={image}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        )}
        <div
          className="absolute inset-0 mix-blend-multiply"
          style={{ backgroundColor: color, opacity: 0.55 }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-3">
          <span className="font-mono text-xs font-semibold tracking-wide text-white/80">
            {enrollment.course.code}
          </span>
          <p className="mt-0.5 truncate font-display text-sm font-semibold text-white">
            {enrollment.course.title}
          </p>
        </div>
        <span className="absolute right-3 top-3 rounded-sm bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
          {enrollment.status}
        </span>
      </Link>

      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-ink-soft">
                Section
              </span>
              <span className="font-mono font-medium">
                {enrollment.section.sectionNumber}
              </span>
            </div>
            <p className="text-ink-soft">{enrollment.section.meetingPattern}</p>
            <p className="text-xs text-ink-soft">{enrollment.section.room}</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-medium">{enrollment.section.instructorName}</p>
            <p className="font-mono text-xs text-ink-soft">
              {enrollment.course.credits} credits
            </p>
            {enrollment.status === EnrollmentStatus.WAITLISTED &&
              enrollment.waitlistPosition != null && (
                <p className="mt-1 text-xs font-semibold text-wait">
                  #{enrollment.waitlistPosition} in line
                </p>
              )}
          </div>
        </div>

        {withActions && (
          <div className="mt-3 border-t border-line pt-3">
            <EnrollmentActions enrollmentId={enrollment.id} status={enrollment.status} />
          </div>
        )}
      </div>
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
