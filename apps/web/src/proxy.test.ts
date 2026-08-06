import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { proxy } from './proxy';

const API_URL = 'http://localhost:3000';

function request(path: string, cookies: Record<string, string> = {}): NextRequest {
  const req = new NextRequest(`http://localhost:3001${path}`);
  for (const [name, value] of Object.entries(cookies)) req.cookies.set(name, value);
  return req;
}

/**
 * Stands in for the API's refresh response. The proxy reads exactly two
 * things off it, and `getSetCookie` is stubbed rather than built from a
 * real Headers because the fetch implementation under test normalizes
 * Set-Cookie away on a synthesized Response.
 */
function refreshResponse(setCookies: string[], ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 401,
    headers: { getSetCookie: () => setCookies },
  } as unknown as Response;
}

const ROTATED = [
  'access_token=new-access; Path=/; HttpOnly; SameSite=Strict',
  'refresh_token=new-refresh; Path=/; HttpOnly; SameSite=Strict',
];

describe('proxy', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('passes an authenticated request straight through', async () => {
    const res = await proxy(request('/catalog', { access_token: 'live' }));

    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('redirects a session-less visitor to login carrying the path', async () => {
    const res = await proxy(request('/courses/abc?tab=sections'));

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location')!);
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('next')).toBe('/courses/abc?tab=sections');
  });

  it('omits the next parameter when the target is the root', async () => {
    const res = await proxy(request('/'));

    const location = new URL(res.headers.get('location')!);
    expect(location.searchParams.has('next')).toBe(false);
  });

  it('refreshes with only a refresh cookie and applies the new pair both ways', async () => {
    fetchMock.mockResolvedValue(refreshResponse(ROTATED));

    const res = await proxy(request('/catalog', { refresh_token: 'rotate-me' }));

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/api/v1/auth/refresh`,
      expect.objectContaining({ method: 'POST' }),
    );

    // Browser gets the rotated cookies...
    expect(res.headers.getSetCookie()).toEqual(ROTATED);
    // ...and this render's own RSC fetches already carry the new access
    // token, rather than 401ing their way through a second refresh.
    const forwarded = res.headers.get('x-middleware-override-headers');
    expect(forwarded).toContain('cookie');
    expect(res.headers.get('x-middleware-request-cookie')).toBe(
      'access_token=new-access; refresh_token=new-refresh',
    );
  });

  it('spends one refresh token for a burst of parallel requests', async () => {
    let resolveRefresh: (r: Response) => void = () => {};
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => (resolveRefresh = resolve)),
    );

    // An RSC navigation plus link prefetches all arrive at once with the
    // same refresh cookie. The API treats a replay as theft and revokes
    // the whole family, so exactly one may be spent.
    const inflight = Promise.all([
      proxy(request('/catalog', { refresh_token: 'burst' })),
      proxy(request('/enrollments', { refresh_token: 'burst' })),
      proxy(request('/notifications', { refresh_token: 'burst' })),
    ]);
    resolveRefresh(refreshResponse(ROTATED));
    await inflight;

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reuses the settled result for a straggler inside the retention window', async () => {
    fetchMock.mockResolvedValue(refreshResponse(ROTATED));

    await proxy(request('/catalog', { refresh_token: 'retained' }));
    await proxy(request('/enrollments', { refresh_token: 'retained' }));

    // The second request's browser has not round-tripped the new
    // Set-Cookie yet, so it still presents the old token. Refreshing
    // again would look like reuse.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('redirects to login when the API rejects the refresh token', async () => {
    fetchMock.mockResolvedValue(refreshResponse([], false));

    const res = await proxy(request('/catalog', { refresh_token: 'revoked' }));

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/login');
  });

  it('passes through rather than logging out when the API is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await proxy(request('/catalog', { refresh_token: 'valid' }));

    // A network blip is an outage for the page's own data fetching to
    // surface with a retry boundary, not evidence the session is gone.
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('keeps unrelated cookies on the forwarded request', async () => {
    fetchMock.mockResolvedValue(refreshResponse(ROTATED));

    const res = await proxy(
      request('/catalog', { refresh_token: 'with-extras', theme: 'dark' }),
    );

    expect(res.headers.get('x-middleware-request-cookie')).toBe(
      'theme=dark; access_token=new-access; refresh_token=new-refresh',
    );
  });
});
