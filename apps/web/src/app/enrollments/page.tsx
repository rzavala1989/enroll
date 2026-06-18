import type { Metadata } from 'next';
import Link from 'next/link';
import { EnrollmentStatus } from '@enroll/shared';
import type { MyEnrollment } from '@enroll/shared';

import { Badge } from '@/components/ui/badge';
import type { BadgeTone } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { apiGet } from '@/lib/api/server';

import { EnrollmentActions } from './enrollment-actions';

export const metadata: Metadata = { title: 'My enrollments' };

const statusTone: Record<EnrollmentStatus, BadgeTone> = {
  [EnrollmentStatus.ENROLLED]: 'open',
  [EnrollmentStatus.WAITLISTED]: 'wait',
  [EnrollmentStatus.DROPPED]: 'neutral',
  [EnrollmentStatus.COMPLETED]: 'pine',
};

function EnrollmentRows({ rows, withActions }: { rows: MyEnrollment[]; withActions: boolean }) {
  return (
    <Table>
      <THead>
        <tr>
          <TH>Status</TH>
          <TH>Course</TH>
          <TH>Section</TH>
          <TH>Meets</TH>
          <TH>Instructor</TH>
          {withActions && <TH className="text-right">Action</TH>}
        </tr>
      </THead>
      <TBody>
        {rows.map((e) => (
          <TR key={e.id}>
            <TD>
              <span className="flex items-center gap-1.5">
                <Badge tone={statusTone[e.status]}>{e.status}</Badge>
                {e.status === EnrollmentStatus.WAITLISTED && e.waitlistPosition != null && (
                  <span className="text-xs text-wait">#{e.waitlistPosition} in line</span>
                )}
              </span>
            </TD>
            <TD>
              <Link href={`/courses/${e.course.id}`} className="hover:underline">
                <span className="font-mono font-semibold text-pine">{e.course.code}</span>{' '}
                {e.course.title}
              </Link>
            </TD>
            <TD className="font-mono">{e.section.sectionNumber}</TD>
            <TD>
              {e.section.meetingPattern}
              <span className="block text-xs text-ink-soft">{e.section.room}</span>
            </TD>
            <TD>{e.section.instructorName}</TD>
            {withActions && (
              <TD className="text-right">
                <EnrollmentActions enrollmentId={e.id} status={e.status} />
              </TD>
            )}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

export default async function EnrollmentsPage() {
  const rows = await apiGet<MyEnrollment[]>('/enrollments');
  const active = rows.filter(
    (e) => e.status === EnrollmentStatus.ENROLLED || e.status === EnrollmentStatus.WAITLISTED,
  );
  const past = rows.filter(
    (e) => e.status !== EnrollmentStatus.ENROLLED && e.status !== EnrollmentStatus.WAITLISTED,
  );

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-pine-dark">My enrollments</h1>

      {active.length === 0 ? (
        <Card className="mt-6 text-center text-sm text-ink-soft">
          You have no active enrollments.{' '}
          <Link href="/catalog" className="text-pine underline">
            Browse the catalog
          </Link>
        </Card>
      ) : (
        <div className="mt-6">
          <EnrollmentRows rows={active} withActions />
        </div>
      )}

      {past.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm font-semibold text-ink-soft">
            Past enrollments ({past.length})
          </summary>
          <div className="mt-3">
            <EnrollmentRows rows={past} withActions={false} />
          </div>
        </details>
      )}
    </div>
  );
}
