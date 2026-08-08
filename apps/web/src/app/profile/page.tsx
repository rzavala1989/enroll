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
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
        {label}
      </dt>
      <dd className="mt-0.5 text-2xl font-semibold tabular-nums text-ink">{value}</dd>
      {sub && <dd className="text-xs text-ink-soft">{sub}</dd>}
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
    <section className={`rounded-sm border border-line bg-card p-5 ${className ?? ''}`}>
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-ink-soft">
        {title}
      </h2>
      {children}
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
      <div className="mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">
            {identity?.firstName} {identity?.lastName}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">{identity?.email}</p>
        </div>
        {profile.classStanding && (
          <Badge tone="pine">
            {standingLabels[profile.classStanding] ?? profile.classStanding}
          </Badge>
        )}
      </div>

      {/* Holds banner */}
      {profile.holds.length > 0 && (
        <div className="mb-8 rounded-sm border border-full/30 bg-full-soft p-4">
          <p className="text-sm font-semibold text-full">
            {profile.holds.length === 1
              ? 'You have an active hold on your account'
              : `You have ${profile.holds.length} active holds on your account`}
          </p>
          <ul className="mt-2 space-y-1">
            {profile.holds.map((h) => (
              <li key={h.id} className="text-sm text-full flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-full/60" />
                <span className="font-medium">{h.reason}</span>
                <span className="text-full/80"> (placed by {h.advisorName})</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-full/80">
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
            <div className="mt-4 h-2 overflow-hidden rounded-sm bg-line">
              <div
                className="h-full rounded-sm bg-pine transition-all"
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
              <div className="pt-3 border-t border-line">
                <Stat label="Waitlisted" value={profile.currentTerm!.waitlistedCourses} />
              </div>
            )}
          </dl>
        </Card>

        <Card title="Completed">
          <dl className="space-y-4">
            <Stat label="Credits" value={profile.completedCredits} />
            <Stat label="Courses" value={completed.length} />
          </dl>
        </Card>

        <Card title="Advisor">
          {profile.advisor ? (
            <div className="flex flex-col h-full justify-between">
              <div>
                <p className="font-medium text-ink">
                  {profile.advisor.firstName} {profile.advisor.lastName}
                </p>
                <p className="mt-0.5 text-sm text-ink-soft">{profile.advisor.email}</p>
              </div>
              <div className="mt-4">
                <ContactAdvisorButton
                  advisorName={`${profile.advisor.firstName} ${profile.advisor.lastName}`}
                  advisorEmail={profile.advisor.email}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-soft">No advisor assigned</p>
          )}
        </Card>
      </div>

      {/* Current schedule */}
      {active.length > 0 && (
        <section className="mt-10">
          <div className="mb-4 flex items-end justify-between">
            <h2 className="font-display text-lg font-semibold text-pine-dark">
              Current schedule
            </h2>
            <Link href="/enrollments" className="text-sm text-pine hover:underline">
              View all enrollments
            </Link>
          </div>
          <div className="overflow-hidden rounded-sm border border-line bg-card">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-paper text-left text-xs uppercase tracking-wide text-ink-soft border-b border-line">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Course
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Credits
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Schedule
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Room
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Instructor
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {active.map((e) => (
                    <tr key={e.id} className="hover:bg-paper/50">
                      <td className="whitespace-nowrap px-4 py-3 align-middle">
                        <Badge tone={statusTone[e.status]}>{e.status}</Badge>
                        {e.status === EnrollmentStatus.WAITLISTED &&
                          e.waitlistPosition != null && (
                            <span className="ml-2 text-xs font-semibold text-wait">
                              #{e.waitlistPosition}
                            </span>
                          )}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <Link
                          href={`/courses/${e.course.id}`}
                          className="hover:underline"
                        >
                          <span className="font-mono font-semibold text-pine">
                            {e.course.code}
                          </span>{' '}
                          <span className="text-ink">{e.course.title}</span>
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 align-middle font-mono text-ink-soft">
                        {e.course.credits}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 align-middle">
                        {e.section.meetingPattern}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 align-middle text-ink-soft">
                        {e.section.room}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 align-middle">
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
        <details className="mt-10">
          <summary className="cursor-pointer text-sm font-semibold text-ink-soft hover:text-ink">
            Completed courses ({completed.length})
          </summary>
          <div className="mt-4 overflow-hidden rounded-sm border border-line bg-card">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-paper text-left text-xs uppercase tracking-wide text-ink-soft border-b border-line">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Course
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Credits
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Section
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Instructor
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {completed.map((e) => (
                    <tr key={e.id} className="hover:bg-paper/50">
                      <td className="px-4 py-3 align-middle">
                        <span className="font-mono font-semibold text-pine">
                          {e.course.code}
                        </span>{' '}
                        <span className="text-ink">{e.course.title}</span>
                      </td>
                      <td className="px-4 py-3 align-middle font-mono text-ink-soft">
                        {e.course.credits}
                      </td>
                      <td className="px-4 py-3 align-middle font-mono text-ink-soft">
                        {e.section.sectionNumber}
                      </td>
                      <td className="px-4 py-3 align-middle text-ink-soft">
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
