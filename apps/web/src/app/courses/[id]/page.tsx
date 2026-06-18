import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Role } from '@enroll/shared';
import type { CourseDetail } from '@enroll/shared';

import { Badge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { apiGet } from '@/lib/api/server';
import { getIdentity } from '@/lib/identity';
import { seatStatus } from '@/lib/seat-status';

import { EnrollButton } from './enroll-button';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const seatTone = { open: 'open', 'nearly-full': 'amber', full: 'full' } as const;

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
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
      <h1 className="font-display mt-1 text-3xl font-bold text-pine-dark">{course.title}</h1>
      {course.description && (
        <p className="mt-3 max-w-2xl text-sm text-ink-soft">{course.description}</p>
      )}

      <h2 className="font-display mt-8 text-lg font-semibold">Sections</h2>
      <div className="mt-3">
        <Table>
          <THead>
            <tr>
              <TH>Section</TH>
              <TH>Instructor</TH>
              <TH>Meets</TH>
              <TH>Room</TH>
              <TH>Seats</TH>
              <TH className="text-right">Action</TH>
            </tr>
          </THead>
          <TBody>
            {course.sections.map((s) => {
              const status = seatStatus(s.seatsAvailable, s.capacity);
              return (
                <TR key={s.id}>
                  <TD className="font-mono font-semibold">{s.sectionNumber}</TD>
                  <TD>{s.instructorName}</TD>
                  <TD>{s.meetingPattern}</TD>
                  <TD>{s.room}</TD>
                  <TD>
                    <Badge tone={seatTone[status]}>
                      {status === 'full'
                        ? 'Full'
                        : `${s.seatsAvailable} of ${s.capacity} open`}
                    </Badge>
                  </TD>
                  <TD className="text-right">
                    {isStudent && <EnrollButton sectionId={s.id} full={status === 'full'} />}
                    {isStaff && (
                      <Link
                        href={`/sections/${s.id}/waitlist?course=${encodeURIComponent(course.code)}&section=${encodeURIComponent(s.sectionNumber)}`}
                        className="text-sm text-pine underline"
                      >
                        Waitlist
                      </Link>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
