import { cache } from 'react';
import { cookies } from 'next/headers';
import type { AuthUser } from '@enroll/shared';

import { API_URL } from './api/server';

/**
 * Who is logged in, or null. Does not redirect: the layout renders for
 * /login too, where a missing session is normal. Wrapped in cache() so
 * the layout and a page calling this in the same render share one fetch.
 */
export const getIdentity = cache(async (): Promise<AuthUser | null> => {
  const cookieStore = await cookies();
  if (!cookieStore.get('access_token')?.value) return null;

  const res = await fetch(`${API_URL}/api/auth/me`, {
    headers: { cookie: cookieStore.toString() },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return res.json() as Promise<AuthUser>;
});
