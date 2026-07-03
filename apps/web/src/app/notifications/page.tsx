import type { Metadata } from 'next';
import type { NotificationsResponse } from '@enroll/shared';

import { Card } from '@/components/ui/card';
import { apiGet } from '@/lib/api/server';

import { MarkAllReadButton } from './mark-all-read-button';
import { NotificationRow } from './notification-row';

export const metadata: Metadata = { title: 'Notifications' };

export default async function NotificationsPage() {
  const { data, unreadCount } = await apiGet<NotificationsResponse>('/notifications');

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-pine-dark">Notifications</h1>
        <MarkAllReadButton unreadCount={unreadCount} />
      </div>

      {data.length === 0 ? (
        <Card className="mt-6 text-center text-sm text-ink-soft">You have no notifications.</Card>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {data.map((n) => (
            <NotificationRow key={n.id} notification={n} />
          ))}
        </div>
      )}
    </div>
  );
}
