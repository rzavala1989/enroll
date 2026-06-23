import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { WaitlistEntry } from '@enroll/shared';

import { Card } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { apiGet } from '@/lib/api/server';
import { formatDateTime } from '@/lib/format';

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

  const entries = await apiGet<WaitlistEntry[]>(`/sections/${id}/waitlist`);

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-pine-dark">
        Waitlist{course ? ` for ${course}` : ''}
        {section ? ` section ${section}` : ''}
      </h1>
      <p className="mt-1 font-mono text-xs text-ink-soft">Section {id}</p>

      {entries.length === 0 ? (
        <Card className="mt-6 text-center text-sm text-ink-soft">No one is waiting.</Card>
      ) : (
        <div className="mt-6 max-w-2xl">
          <Table>
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
        </div>
      )}
    </div>
  );
}
