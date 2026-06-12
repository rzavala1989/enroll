import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

// Single-flight refresh. Parallel requests (an RSC navigation plus a burst
// of link prefetches) can all arrive without an access token but with the
// same refresh token. The API rotates refresh tokens and treats reuse as
// theft, revoking the whole family, so each token must be spent exactly
// once. The settled result is retained briefly for stragglers whose
// browser has not round-tripped the new set-cookie yet.
const inflightRefreshes = new Map<string, Promise<string[] | null>>();
const REFRESH_RESULT_RETENTION_MS = 10_000;

/**
 * Returns the set-cookie headers from a successful refresh, null when the
 * API rejected the token, or an empty array when the API was unreachable.
 */
async function refreshSession(refreshToken: string): Promise<string[] | null> {
  try {
    const refreshed = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { cookie: `refresh_token=${refreshToken}` },
    });
    if (!refreshed.ok) return null;
    return refreshed.headers.getSetCookie();
  } catch {
    // Network failure, not a rejection: the caller passes through and the
    // page's own data fetching surfaces the outage with a retry boundary.
    return [];
  }
}

/**
 * Session gate for every app route (matcher excludes /api, /login and
 * static assets):
 * - access_token present: pass through.
 * - only refresh_token present: refresh against the API, apply the new
 *   cookies to BOTH the response (browser) and the forwarded request
 *   (so this render's RSC fetches already carry the new access token).
 * - neither, or the refresh is rejected: redirect to /login?next=<path>.
 */
export async function proxy(request: NextRequest) {
  if (request.cookies.has('access_token')) return NextResponse.next();

  const refreshToken = request.cookies.get('refresh_token')?.value;
  if (refreshToken) {
    let flight = inflightRefreshes.get(refreshToken);
    if (!flight) {
      flight = refreshSession(refreshToken);
      inflightRefreshes.set(refreshToken, flight);
      flight.finally(() => {
        setTimeout(() => inflightRefreshes.delete(refreshToken), REFRESH_RESULT_RETENTION_MS);
      });
    }
    const setCookies = await flight;

    if (setCookies && setCookies.length === 0) return NextResponse.next();

    if (setCookies) {
      const newAccess = readSetCookieValue(setCookies, 'access_token');
      const newRefresh = readSetCookieValue(setCookies, 'refresh_token');

      const cookieParts = request.cookies
        .getAll()
        .filter((c) => c.name !== 'access_token' && c.name !== 'refresh_token')
        .map((c) => `${c.name}=${c.value}`);
      cookieParts.push(`access_token=${newAccess ?? ''}`);
      cookieParts.push(`refresh_token=${newRefresh ?? refreshToken}`);

      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('cookie', cookieParts.join('; '));
      const response = NextResponse.next({ request: { headers: requestHeaders } });
      for (const sc of setCookies) response.headers.append('set-cookie', sc);
      return response;
    }
  }

  const login = new URL('/login', request.url);
  const target = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (target !== '/') login.searchParams.set('next', target);
  return NextResponse.redirect(login);
}

function readSetCookieValue(setCookies: string[], name: string): string | null {
  for (const sc of setCookies) {
    if (sc.startsWith(`${name}=`)) return sc.slice(name.length + 1).split(';')[0];
  }
  return null;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|login).*)'],
};
