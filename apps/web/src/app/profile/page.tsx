import type { Metadata } from 'next';
import Link from 'next/link';
import type { StudentProfile, MyEnrollment } from '@enroll/shared';
import { EnrollmentStatus } from '@enroll/shared';

import { apiGet } from '@/lib/api/server';
import { getIdentity } from '@/lib/identity';

import { ContactAdvisorButton } from './contact-advisor';
import { CurrentScheduleTable, CompletedCoursesTable } from './profile-tables';

export const metadata: Metadata = { title: 'My profile' };

const standingLabels: Record<string, string> = {
  FRESHMAN: 'Freshman',
  SOPHOMORE: 'Sophomore',
  JUNIOR: 'Junior',
  SENIOR: 'Senior',
};

export default async function ProfilePage() {
  const [identity, profile, enrollments] = await Promise.all([
    getIdentity(),
    apiGet<StudentProfile>('/auth/profile'),
    apiGet<MyEnrollment[]>('/enrollments'),
  ]);

  const active = enrollments.filter(
    (e) =>
      e.status === EnrollmentStatus.ENROLLED || e.status === EnrollmentStatus.WAITLISTED,
  );

  const completed = enrollments.filter((e) => e.status === EnrollmentStatus.COMPLETED);

  const creditCap = profile.currentTerm
    ? (profile.currentTerm.overloadMaxCredits ?? profile.currentTerm.maxCredits)
    : 18;

  const initials =
    `${identity?.firstName?.[0] ?? ''}${identity?.lastName?.[0] ?? ''}`.toUpperCase() ||
    '?';

  return (
    <div className="mx-auto max-w-6xl pb-12">
      {/* Header */}
      <header className="mb-10 border-b border-line pb-10 pt-4">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pine to-pine-dark text-3xl font-semibold tracking-wider text-paper shadow-md ring-4 ring-paper">
            {initials}
          </div>
          <div>
            <h1 className="font-display text-4xl font-bold tracking-tight text-ink">
              {identity?.firstName} {identity?.lastName}
            </h1>
            <div className="mt-3 flex items-center gap-3 text-sm text-ink-soft">
              <span>{identity?.email}</span>
              <span className="h-1 w-1 rounded-full bg-line" />
              <span className="rounded-full border border-pine/20 bg-pine/5 px-2.5 py-0.5 font-medium text-pine">
                {profile.classStanding
                  ? (standingLabels[profile.classStanding] ?? profile.classStanding)
                  : 'Student'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {profile.holds.length > 0 && (
        <div className="mb-10 rounded-sm border-l-2 border-full bg-full-soft p-5">
          <h3 className="font-semibold text-full">
            {profile.holds.length === 1
              ? 'Registration Hold'
              : `${profile.holds.length} Registration Holds`}
          </h3>
          <ul className="mt-2 list-inside list-disc text-sm text-full/90">
            {profile.holds.map((h) => (
              <li key={h.id}>
                {h.reason} <span className="opacity-70">(Placed by {h.advisorName})</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm font-medium text-full">
            Contact your advisor to resolve holds before registering.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-start">
        {/* Main Content */}
        <div className="space-y-12 lg:col-span-8 xl:col-span-9 min-w-0">
          {active.length > 0 ? (
            <section>
              <div className="mb-5 flex items-baseline justify-between">
                <h2 className="font-display text-xl font-semibold text-pine-dark">
                  Current schedule
                </h2>
                <Link
                  href="/enrollments"
                  className="text-sm font-medium text-pine hover:underline"
                >
                  Manage enrollments →
                </Link>
              </div>
              <CurrentScheduleTable enrollments={active} />
            </section>
          ) : (
            <section>
              <h2 className="font-display text-xl font-semibold text-pine-dark">
                Current schedule
              </h2>
              <div className="mt-5 rounded-sm border border-dashed border-line p-8 text-center">
                <p className="text-ink-soft">
                  You are not enrolled in any courses this term.
                </p>
                <Link
                  href="/catalog"
                  className="mt-4 inline-flex items-center rounded-sm bg-pine px-4 py-2 text-sm font-medium text-paper hover:bg-pine-dark transition-colors"
                >
                  Browse catalog
                </Link>
              </div>
            </section>
          )}

          {completed.length > 0 && (
            <section>
              <h2 className="mb-5 font-display text-xl font-semibold text-pine-dark">
                Academic history
              </h2>
              <CompletedCoursesTable enrollments={completed} />
            </section>
          )}
        </div>

        {/* Sidebar */}
        <aside className="w-full space-y-8 lg:col-span-4 xl:col-span-3">
          {/* Term Progress */}
          <section>
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Term Progress
            </h3>
            <div className="space-y-5">
              <div>
                <div className="flex items-end justify-between">
                  <span className="text-sm font-medium text-ink">Registered Credits</span>
                  <span className="font-mono text-sm text-ink-soft">
                    <strong className="text-ink">
                      {profile.currentTerm?.enrolledCredits ?? 0}
                    </strong>{' '}
                    / {creditCap}
                  </span>
                </div>
                {profile.currentTerm && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-pine transition-all"
                      style={{
                        width: `${Math.min(100, (profile.currentTerm.enrolledCredits / creditCap) * 100)}%`,
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-between border-t border-line pt-4 text-sm">
                <span className="text-ink-soft">Active Courses</span>
                <span className="font-mono font-medium text-ink">
                  {profile.currentTerm?.enrolledCourses ?? 0}
                </span>
              </div>

              {(profile.currentTerm?.waitlistedCourses ?? 0) > 0 && (
                <div className="flex justify-between border-t border-line pt-4 text-sm">
                  <span className="text-ink-soft">Waitlisted</span>
                  <span className="font-mono font-medium text-wait">
                    {profile.currentTerm!.waitlistedCourses}
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* Overall Stats */}
          <section>
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Overall Status
            </h3>
            <div className="space-y-4 rounded-sm bg-paper p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-soft">Total Credits</span>
                <span className="font-mono font-medium text-ink">
                  {profile.completedCredits}
                </span>
              </div>
              <div className="flex justify-between border-t border-line pt-4">
                <span className="text-ink-soft">Completed Courses</span>
                <span className="font-mono font-medium text-ink">{completed.length}</span>
              </div>
            </div>
          </section>

          {/* Advisor */}
          <section>
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Academic Advisor
            </h3>
            {profile.advisor ? (
              <div className="rounded-sm border border-line p-4">
                <p className="font-medium text-ink">
                  {profile.advisor.firstName} {profile.advisor.lastName}
                </p>
                <p className="text-sm text-ink-soft">{profile.advisor.email}</p>
                <div className="mt-4">
                  <ContactAdvisorButton
                    advisorName={`${profile.advisor.firstName} ${profile.advisor.lastName}`}
                    advisorEmail={profile.advisor.email}
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm italic text-ink-soft">No advisor assigned</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
