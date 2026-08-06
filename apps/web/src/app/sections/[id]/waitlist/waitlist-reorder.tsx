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
  caption = 'Waitlist',
}: {
  sectionId: string;
  entries: WaitlistEntry[];
  caption?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [order, setOrder] = useState(entries);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);

    // The buttons are labelled, so a screen reader announces the press,
    // but the result of the press is a silent reshuffle of the table
    // above. Without this, a non-sighted admin reordering a waitlist is
    // pressing keys and getting no confirmation of where anyone landed.
    const moved = next[target];
    setAnnouncement(
      `${moved.firstName} ${moved.lastName} moved to position ${target + 1} of ${next.length}.`,
    );
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
        setError(
          err instanceof ApiError ? err.message : 'Something went wrong. Try again.',
        );
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <Table caption={caption}>
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
