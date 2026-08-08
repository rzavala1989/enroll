import type { Metadata } from 'next';
import Link from 'next/link';
import type { StudentProfile, MyEnrollment } from '@enroll/shared';
import { EnrollmentStatus } from '@enroll/shared';

import { Badge } from '@/components/ui/badge';
import type { BadgeTone } from '@/components/ui/badge';
import { apiGet } from '@/lib/api/server';
import { getIdentity } from '@/lib/identity';

import { ContactAdvisorButton } from './contact-advisor';

export const metadata: Metadata = { title: 'My profile' };

const standingLabels: Record<string, string> = {
  FRESHMAN: 'Freshman',
  SOPHOMORE: 'Sophomore',
  JUNIOR: 'Junior',
  SENIOR: 'Senior',
};

const statusTone: Record<EnrollmentStatus, BadgeTone> = {
  [EnrollmentStatus.ENROLLED]: 'open',
  [EnrollmentStatus.WAITLISTED]: 'wait',
  [EnrollmentStatus.DROPPED]: 'neutral',
  [EnrollmentStatus.COMPLETED]: 'pine',
};

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-pine-dark">
        {value}
      </dd>
      {sub && <dd className="mt-0.5 text-xs font-medium text-ink-soft/70">{sub}</dd>}
    </div>
  );
}

function Card({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`relative overflow-hidden rounded-xl border border-line/50 bg-white shadow-sm ring-1 ring-black/5 transition-all hover:shadow-md ${className ?? ''}`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-pine-soft/10 to-transparent opacity-50" />
      <div className="relative p-5">
        <h2 className="mb-4 text-[11px] font-bold uppercase tracking-widest text-pine-dark/70">
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}

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

  return (
    <div className="mx-auto max-w-5xl pb-12">
      {/* Premium Header */}
      <div className="relative mb-8 overflow-hidden rounded-2xl bg-gradient-to-r from-pine to-pine-dark p-8 shadow-lg text-white ring-1 ring-pine/20">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white opacity-5 mix-blend-overlay blur-3xl" />
        <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-pine-soft opacity-10 mix-blend-overlay blur-3xl" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-6">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-white/10 text-3xl font-bold shadow-inner backdrop-blur-sm border border-white/20">
              {identity?.firstName?.[0]}
              {identity?.lastName?.[0]}
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold tracking-tight text-white drop-shadow-sm">
                {identity?.firstName} {identity?.lastName}
              </h1>
              <p className="mt-1 font-medium text-pine-soft/90">{identity?.email}</p>
            </div>
          </div>
          {profile.classStanding && (
            <div className="shrink-0 self-start sm:self-auto">
              <span className="inline-flex items-center rounded-full border border-white/30 bg-white/20 px-4 py-1.5 text-sm font-semibold text-white shadow-sm backdrop-blur-md">
                {standingLabels[profile.classStanding] ?? profile.classStanding}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Holds banner */}
      {profile.holds.length > 0 && (
        <div className="mb-8 rounded-xl border border-full/30 bg-full-soft/50 p-4 shadow-sm backdrop-blur-sm relative overflow-hidden">
          <div className="absolute left-0 top-0 h-full w-1 bg-full" />
          <p className="text-base font-semibold text-full">
            {profile.holds.length === 1
              ? 'You have an active hold on your account'
              : `You have ${profile.holds.length} active holds on your account`}
          </p>
          <ul className="mt-3 space-y-1.5 ml-1">
            {profile.holds.map((h) => (
              <li key={h.id} className="text-sm text-full flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-full/60" />
                <span className="font-medium">{h.reason}</span>
                <span className="text-full/70 text-xs uppercase tracking-wider">
                  {' '}
                  (placed by {h.advisorName})
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs font-medium text-full/80">
            Contact your advisor to resolve holds before registering.
          </p>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Term credits">
          <dl>
            <Stat
              label="Enrolled"
              value={profile.currentTerm?.enrolledCredits ?? 0}
              sub={`of ${creditCap} max`}
            />
          </dl>
          {profile.currentTerm && (
            <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-line/60 shadow-inner">
              <div
                className="h-full rounded-full bg-gradient-to-r from-pine to-pine-dark transition-all duration-500 ease-out"
                style={{
                  width: `${Math.min(100, (profile.currentTerm.enrolledCredits / creditCap) * 100)}%`,
                }}
              />
            </div>
          )}
        </Card>

        <Card title="Courses">
          <dl className="space-y-4">
            <Stat label="Active" value={profile.currentTerm?.enrolledCourses ?? 0} />
            {(profile.currentTerm?.waitlistedCourses ?? 0) > 0 && (
              <div className="pt-2 border-t border-line/40">
                <Stat label="Waitlisted" value={profile.currentTerm!.waitlistedCourses} />
              </div>
            )}
          </dl>
        </Card>

        <Card title="Completed">
          <dl className="flex items-center gap-8">
            <Stat label="Credits" value={profile.completedCredits} />
            <div className="h-10 w-px bg-line/40" />
            <Stat label="Courses" value={completed.length} />
          </dl>
        </Card>

        <Card title="Advisor">
          {profile.advisor ? (
            <div className="flex flex-col h-full justify-between">
              <div>
                <p className="font-bold text-pine-dark">
                  {profile.advisor.firstName} {profile.advisor.lastName}
                </p>
                <p className="mt-1 text-xs font-medium text-ink-soft">
                  {profile.advisor.email}
                </p>
              </div>
              <div className="mt-5">
                <ContactAdvisorButton
                  advisorName={`${profile.advisor.firstName} ${profile.advisor.lastName}`}
                  advisorEmail={profile.advisor.email}
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm font-medium text-ink-soft/70 italic">
                No advisor assigned
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* Current schedule */}
      {active.length > 0 && (
        <section className="mt-12">
          <div className="mb-4 flex items-end justify-between">
            <h2 className="font-display text-xl font-bold tracking-tight text-pine-dark">
              Current schedule
            </h2>
            <Link
              href="/enrollments"
              className="text-sm font-semibold text-pine hover:text-pine-dark hover:underline transition-colors"
            >
              View all enrollments &rarr;
            </Link>
          </div>
          <div className="overflow-hidden rounded-xl border border-line/60 bg-white shadow-sm ring-1 ring-black/5">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-paper/80 backdrop-blur-sm text-left text-xs uppercase tracking-wider text-ink-soft border-b border-line/60">
                  <tr>
                    <th scope="col" className="px-5 py-4 font-bold">
                      Status
                    </th>
                    <th scope="col" className="px-5 py-4 font-bold">
                      Course
                    </th>
                    <th scope="col" className="px-5 py-4 font-bold">
                      Credits
                    </th>
                    <th scope="col" className="px-5 py-4 font-bold">
                      Schedule
                    </th>
                    <th scope="col" className="px-5 py-4 font-bold">
                      Room
                    </th>
                    <th scope="col" className="px-5 py-4 font-bold">
                      Instructor
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/40">
                  {active.map((e) => (
                    <tr
                      key={e.id}
                      className="group transition-colors hover:bg-pine-soft/10"
                    >
                      <td className="whitespace-nowrap px-5 py-3.5 align-middle">
                        <Badge tone={statusTone[e.status]} className="shadow-sm">
                          {e.status}
                        </Badge>
                        {e.status === EnrollmentStatus.WAITLISTED &&
                          e.waitlistPosition != null && (
                            <span className="ml-2 inline-flex items-center rounded-full bg-wait/10 px-2 py-0.5 text-xs font-bold text-wait ring-1 ring-inset ring-wait/20">
                              #{e.waitlistPosition}
                            </span>
                          )}
                      </td>
                      <td className="px-5 py-3.5 align-middle">
                        <Link
                          href={`/courses/${e.course.id}`}
                          className="group-hover:text-pine transition-colors"
                        >
                          <span className="font-mono font-bold text-pine">
                            {e.course.code}
                          </span>{' '}
                          <span className="font-medium text-pine-dark">
                            {e.course.title}
                          </span>
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 align-middle font-mono font-medium text-ink-soft">
                        {e.course.credits}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 align-middle font-medium">
                        {e.section.meetingPattern}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 align-middle text-ink-soft font-medium">
                        {e.section.room}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 align-middle font-medium">
                        {e.section.instructorName}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Completed courses */}
      {completed.length > 0 && (
        <details className="mt-10 group">
          <summary className="inline-flex cursor-pointer items-center gap-2 text-sm font-bold uppercase tracking-wider text-ink-soft transition-colors hover:text-pine-dark focus:outline-none">
            <span className="group-open:rotate-90 transition-transform duration-200">
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M4.5 9L7.5 6L4.5 3"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            Completed courses ({completed.length})
          </summary>
          <div className="mt-4 overflow-hidden rounded-xl border border-line/60 bg-white shadow-sm ring-1 ring-black/5 opacity-0 translate-y-2 animate-[fade-in-up_0.3s_ease-out_forwards]">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-paper/80 backdrop-blur-sm text-left text-xs uppercase tracking-wider text-ink-soft border-b border-line/60">
                  <tr>
                    <th scope="col" className="px-5 py-4 font-bold">
                      Course
                    </th>
                    <th scope="col" className="px-5 py-4 font-bold">
                      Credits
                    </th>
                    <th scope="col" className="px-5 py-4 font-bold">
                      Section
                    </th>
                    <th scope="col" className="px-5 py-4 font-bold">
                      Instructor
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/40">
                  {completed.map((e) => (
                    <tr key={e.id} className="transition-colors hover:bg-paper/60">
                      <td className="px-5 py-3.5 align-middle">
                        <span className="font-mono font-bold text-pine/70">
                          {e.course.code}
                        </span>{' '}
                        <span className="font-medium text-ink">{e.course.title}</span>
                      </td>
                      <td className="px-5 py-3.5 align-middle font-mono text-ink-soft font-medium">
                        {e.course.credits}
                      </td>
                      <td className="px-5 py-3.5 align-middle font-mono text-ink-soft font-medium">
                        {e.section.sectionNumber}
                      </td>
                      <td className="px-5 py-3.5 align-middle font-medium text-ink-soft">
                        {e.section.instructorName}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
