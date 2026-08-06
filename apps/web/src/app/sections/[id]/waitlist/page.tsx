import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Role } from '@enroll/shared';
import type { SectionSummary, WaitlistEntry } from '@enroll/shared';

import { EmptyState } from '@/components/ui/empty-state';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { apiGet } from '@/lib/api/server';
import { formatDateTime } from '@/lib/format';
import { getIdentity } from '@/lib/identity';

import { SectionSettings } from './section-settings';
import { WaitlistReorder } from './waitlist-reorder';

export const metadata: Metadata = { title: 'Waitlist' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function WaitlistPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ course?: string; section?: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { course, section } = await searchParams;

  const identity = await getIdentity();
  const isAdmin = identity?.roles.includes(Role.ADMIN) ?? false;

  const [entries, summary] = await Promise.all([
    apiGet<WaitlistEntry[]>(`/sections/${id}/waitlist`),
    isAdmin ? apiGet<SectionSummary>(`/sections/${id}`) : Promise.resolve(null),
  ]);

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-pine-dark">
        Waitlist{course ? ` for ${course}` : ''}
        {section ? ` section ${section}` : ''}
      </h1>
      <p className="mt-1 font-mono text-xs text-ink-soft">Section {id}</p>

      {summary && (
        <div className="mt-6">
          <SectionSettings section={summary} />
        </div>
      )}

      {entries.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="No students waiting"
          body={
            summary && summary.seatsAvailable > 0
              ? 'Students join the waitlist only once every seat is taken. This section still has room, so enrollments go straight through.'
              : 'Students who try to enroll while this section is full land here, in join order. When a seat opens, the student at the top is enrolled automatically.'
          }
          facts={
            summary
              ? [
                  {
                    label: 'Seats',
                    value: `${summary.enrolledCount} of ${summary.capacity} taken`,
                  },
                  { label: 'Available', value: summary.seatsAvailable },
                  {
                    label: 'Waitlist cap',
                    value:
                      summary.waitlistCap === null
                        ? 'Unlimited'
                        : summary.waitlistCap === 0
                          ? 'Disabled'
                          : summary.waitlistCap,
                  },
                ]
              : undefined
          }
        />
      ) : (
        <div className="mt-6 max-w-2xl">
          {isAdmin ? (
            <WaitlistReorder
              sectionId={id}
              entries={entries}
              caption={`Waitlist${course ? ` for ${course}` : ''}${section ? ` section ${section}` : ''}`}
            />
          ) : (
            <Table
              caption={`Waitlist${course ? ` for ${course}` : ''}${section ? ` section ${section}` : ''}`}
            >
              <THead>
                <tr>
                  <TH className="w-16">#</TH>
                  <TH>Student</TH>
                  <TH>Joined</TH>
                </tr>
              </THead>
              <TBody>
                {entries.map((e) => (
                  <TR key={e.enrollmentId}>
                    <TD className="font-mono font-semibold text-wait">{e.position}</TD>
                    <TD>
                      {e.firstName} {e.lastName}
                    </TD>
                    <TD className="text-ink-soft">{formatDateTime(e.joinedAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      )}
    </div>
  );
}
