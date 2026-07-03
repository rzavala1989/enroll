'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { ApiError, apiFetch } from '@/lib/api/client';

export function MarkAllReadButton({ unreadCount }: { unreadCount: number }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markAllRead() {
    setPending(true);
    setError(null);
    try {
      await apiFetch<{ updated: number }>('/notifications/read-all', { method: 'POST' });
      toast.push({ kind: 'success', title: 'All notifications marked read' });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="ghost" onClick={markAllRead} disabled={pending || unreadCount === 0}>
        {pending ? 'Working' : 'Mark all read'}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-full">
          {error}
        </p>
      )}
    </div>
  );
}
