'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { WaitlistEntry } from '@enroll/shared';

import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { ApiError, apiFetch } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';

export function WaitlistReorder({
  sectionId,
  entries,
}: {
  sectionId: string;
  entries: WaitlistEntry[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [order, setOrder] = useState(entries);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
  }

  async function save() {
    setPending(true);
    setError(null);
    setStale(false);
    try {
      await apiFetch(`/sections/${sectionId}/waitlist`, {
        method: 'PATCH',
        body: JSON.stringify({ orderedEnrollmentIds: order.map((e) => e.enrollmentId) }),
      });
      toast.push({ kind: 'success', title: 'Waitlist order saved' });
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.body?.code === 'WAITLIST_CHANGED') {
        setStale(true);
      } else {
        setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <Table>
        <THead>
          <tr>
            <TH className="w-16">#</TH>
            <TH>Student</TH>
            <TH>Joined</TH>
            <TH className="text-right">Reorder</TH>
          </tr>
        </THead>
        <TBody>
          {order.map((e, i) => (
            <TR key={e.enrollmentId}>
              <TD className="font-mono font-semibold text-wait">{i + 1}</TD>
              <TD>
                {e.firstName} {e.lastName}
              </TD>
              <TD className="text-ink-soft">{formatDateTime(e.joinedAt)}</TD>
              <TD className="text-right">
                <div className="inline-flex gap-1">
                  <Button
                    variant="ghost"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={`Move ${e.firstName} ${e.lastName} up`}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => move(i, 1)}
                    disabled={i === order.length - 1}
                    aria-label={`Move ${e.firstName} ${e.lastName} down`}
                  >
                    ↓
                  </Button>
                </div>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {pending ? 'Saving' : 'Save order'}
        </Button>
        {error && (
          <p role="alert" className="text-xs text-full">
            {error}
          </p>
        )}
        {stale && (
          <p role="alert" className="flex items-center gap-2 text-xs text-full">
            The waitlist changed since it was loaded.
            <Button variant="ghost" onClick={() => router.refresh()}>
              Refresh
            </Button>
          </p>
        )}
      </div>
    </div>
  );
}
