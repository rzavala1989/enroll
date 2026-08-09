import { Suspense } from 'react';
import { cookies } from 'next/headers';
import type { AuthUser, NotificationsResponse } from '@enroll/shared';

import { SiteNav } from '@/components/site-nav';
import { API_PREFIX, API_URL } from '@/lib/api/server';

/**
 * The nav, with its unread badge streamed in separately.
 *
 * The layout used to await `/notifications?limit=1` before rendering
 * anything, so every page in the app paid a serialized round trip for a
 * number in the corner. The count is small, late, and non-essential:
 * exactly the shape Suspense is for. The nav renders immediately with
 * no badge and the badge fills in when the call returns.
 */
export function NavShell({ identity }: { identity: AuthUser | null }) {
  if (!identity) return <SiteNav identity={null} unreadCount={0} profile={null} />;

  return (
    <Suspense fallback={<SiteNav identity={identity} unreadCount={0} profile={null} />}>
      <NavWithUnreadCount identity={identity} />
    </Suspense>
  );
}

async function NavWithUnreadCount({ identity }: { identity: AuthUser }) {
  let unreadCount = 0;
  let profile = null;
  try {
    const cookieHeader = (await cookies()).toString();
    const [notifRes, profileRes] = await Promise.all([
      fetch(`${API_URL}${API_PREFIX}/notifications?limit=1`, {
        headers: { cookie: cookieHeader },
        cache: 'no-store',
      }),
      fetch(`${API_URL}${API_PREFIX}/auth/profile`, {
        headers: { cookie: cookieHeader },
        cache: 'no-store',
      }),
    ]);
    if (notifRes.ok) {
      unreadCount = ((await notifRes.json()) as NotificationsResponse).unreadCount;
    }
    if (profileRes.ok) {
      profile = await profileRes.json();
    }
  } catch {
    // Network failure: render without badge and profile context.
  }
  return <SiteNav identity={identity} unreadCount={unreadCount} profile={profile} />;
}
