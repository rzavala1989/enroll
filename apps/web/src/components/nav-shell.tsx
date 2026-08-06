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
  if (!identity) return <SiteNav identity={null} unreadCount={0} />;

  return (
    <Suspense fallback={<SiteNav identity={identity} unreadCount={0} />}>
      <NavWithUnreadCount identity={identity} />
    </Suspense>
  );
}

async function NavWithUnreadCount({ identity }: { identity: AuthUser }) {
  // A raw fetch rather than apiGet: apiGet signals 401 and 404 by
  // throwing redirect() and notFound(), which a catch here would
  // swallow. A badge that cannot load should degrade to no badge, not
  // take down the layout or hijack navigation.
  let unreadCount = 0;
  try {
    const cookieHeader = (await cookies()).toString();
    const res = await fetch(`${API_URL}${API_PREFIX}/notifications?limit=1`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    if (res.ok) {
      unreadCount = ((await res.json()) as NotificationsResponse).unreadCount;
    }
  } catch {
    // Network failure: render without a badge.
  }
  return <SiteNav identity={identity} unreadCount={unreadCount} />;
}
