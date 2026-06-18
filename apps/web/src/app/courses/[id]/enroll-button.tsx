'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { EnrollmentResult } from '@enroll/shared';

import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { ApiError, apiFetch } from '@/lib/api/client';
import { enrollErrorMessage } from '@/lib/enroll-errors';

export function EnrollButton({ sectionId, full }: { sectionId: string; full: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<string | null>(null);
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

  if (done) return <span className="text-sm font-semibold text-pine">{done}</span>;

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
