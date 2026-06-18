'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { EnrollmentStatus } from '@enroll/shared';
import type { EnrollmentResult } from '@enroll/shared';

import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { ApiError, apiFetch } from '@/lib/api/client';

export function EnrollmentActions({
  enrollmentId,
  status,
}: {
  enrollmentId: string;
  status: EnrollmentStatus;
}) {
  const router = useRouter();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isWaitlisted = status === EnrollmentStatus.WAITLISTED;
  const verb = isWaitlisted ? 'Leave waitlist' : 'Drop';

  async function drop() {
    setPending(true);
    setError(null);
    try {
      await apiFetch<EnrollmentResult>(`/enrollments/${enrollmentId}/drop`, { method: 'PATCH' });
      toast.push({
        kind: 'success',
        title: isWaitlisted ? 'Left the waitlist' : 'Dropped',
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
      setPending(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button variant="danger" onClick={() => setConfirming(true)}>
          {verb}
        </Button>
        {error && (
          <p role="alert" className="text-xs text-full">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <span className="text-xs text-ink-soft">Sure?</span>
      <Button variant="danger" onClick={drop} disabled={pending}>
        {pending ? 'Working' : `Yes, ${verb.toLowerCase()}`}
      </Button>
      <Button variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
        Cancel
      </Button>
    </div>
  );
}
