import type { Metadata } from 'next';
import type { NotificationsResponse } from '@enroll/shared';

import { EmptyState } from '@/components/ui/empty-state';
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
        <EmptyState
          className="mt-6"
          title="You're all caught up"
          body="You have no new notifications."
        />
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
