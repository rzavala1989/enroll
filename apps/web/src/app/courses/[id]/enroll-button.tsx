'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { EnrollmentResult, ViewerEnrollment } from '@enroll/shared';

import { useToast } from '@/components/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ApiError, apiFetch } from '@/lib/api/client';
import { enrollErrorMessage } from '@/lib/enroll-errors';

function initialDone(viewerEnrollment?: ViewerEnrollment | null): string | null {
  if (viewerEnrollment?.status === 'ENROLLED') return 'Enrolled';
  if (viewerEnrollment?.status === 'WAITLISTED') {
    return `Waitlisted, #${viewerEnrollment.waitlistPosition} in line`;
  }
  return null;
}

export function EnrollButton({
  sectionId,
  full,
  waitlistFull = false,
  viewerEnrollment,
}: {
  sectionId: string;
  full: boolean;
  /** Section is full and its waitlist is at cap: no button, just a note. */
  waitlistFull?: boolean;
  /** The viewer's existing standing in this section, when any. */
  viewerEnrollment?: ViewerEnrollment | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<string | null>(() => initialDone(viewerEnrollment));
  const [error, setError] = useState<string | null>(null);

  async function enroll() {
    setPending(true);
    setError(null);
    try {
      const result = await apiFetch<EnrollmentResult>('/enrollments', {
        method: 'POST',
        body: JSON.stringify({ sectionId }),
      });
      if (result.status === 'WAITLISTED') {
        setDone(`Waitlisted, #${result.waitlistPosition} in line`);
        toast.push({
          kind: 'info',
          title: 'Added to waitlist',
          detail: `You are number ${result.waitlistPosition} in line for this section.`,
        });
      } else {
        setDone('Enrolled');
        toast.push({
          kind: 'success',
          title: 'Enrollment confirmed',
          detail: `${result.sectionEnrolledCount} of ${result.sectionCapacity} seats now taken.`,
        });
      }
      router.refresh();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? enrollErrorMessage(e.body?.code, e.message)
          : 'Something went wrong. Try again.',
      );
    } finally {
      setPending(false);
    }
  }

  if (viewerEnrollment?.status === 'COMPLETED') {
    return <Badge tone="neutral">Completed</Badge>;
  }

  if (done) return <span className="text-sm font-semibold text-pine">{done}</span>;

  if (waitlistFull) {
    return <span className="text-sm text-ink-soft">Section and waitlist full</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant={full ? 'ghost' : 'primary'} onClick={enroll} disabled={pending}>
        {pending ? 'Working' : full ? 'Join waitlist' : 'Enroll'}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-full">
          {error}
        </p>
      )}
    </div>
  );
}
