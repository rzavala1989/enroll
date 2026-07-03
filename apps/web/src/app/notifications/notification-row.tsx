'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { NotificationItem } from '@enroll/shared';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ApiError, apiFetch } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';

export function NotificationRow({ notification }: { notification: NotificationItem }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unread = notification.readAt == null;

  async function markRead() {
    setPending(true);
    setError(null);
    try {
      await apiFetch<NotificationItem>(`/notifications/${notification.id}/read`, {
        method: 'PATCH',
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className={cn('flex items-start justify-between gap-4', unread && 'border-pine bg-pine-soft/40')}>
      <div>
        <p className={cn('text-sm', unread ? 'font-semibold text-pine-dark' : 'text-ink')}>
          {notification.title}
        </p>
        <p className="mt-1 text-sm text-ink-soft">{notification.body}</p>
        <p className="mt-1 text-xs text-ink-soft">{formatDateTime(notification.createdAt)}</p>
      </div>
      {unread && (
        <div className="flex flex-col items-end gap-1">
          <Button variant="ghost" onClick={markRead} disabled={pending}>
            {pending ? 'Working' : 'Mark read'}
          </Button>
          {error && (
            <p role="alert" className="text-xs text-full">
              {error}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
