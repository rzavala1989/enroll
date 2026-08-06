// Browser-side API access. Everything goes through the same-origin
// /api rewrite so the HTTP-only auth cookies ride along automatically.

export interface ApiErrorBody {
  code?: string;
  message?: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody | null,
  ) {
    super(body?.message ?? `Request failed with status ${status}`);
    this.name = 'ApiError';
  }
}

async function parseBody(res: Response): Promise<ApiErrorBody | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Single-flight refresh, mirroring the edge proxy's map in proxy.ts.
 *
 * The API rotates refresh tokens and treats a replay as theft: it
 * revokes the entire token family. Two parallel mutations that both 401
 * would each POST /auth/refresh carrying the same cookie, the second
 * arriving with a token the first already rotated away, and the user
 * gets force-logged-out with an audit trail that reads like a breach.
 * One in-flight refresh, N replays.
 *
 * The settled result is held briefly afterwards for stragglers whose
 * cookie jar has not round-tripped the new Set-Cookie yet: same
 * reasoning as REFRESH_RESULT_RETENTION_MS in proxy.ts, shorter window
 * because these requests all originate in one tab.
 */
const REFRESH_RESULT_RETENTION_MS = 250;

let inflightRefresh: Promise<boolean> | null = null;

function refreshOnce(): Promise<boolean> {
  if (inflightRefresh) return inflightRefresh;

  const flight = fetch('/api/auth/refresh', { method: 'POST' }).then((r) => r.ok);
  inflightRefresh = flight;

  // A network failure rejects every awaiting caller rather than being
  // reported as a rejected token, so a blip does not log anyone out.
  void flight
    .catch(() => undefined)
    .finally(() => {
      setTimeout(() => {
        if (inflightRefresh === flight) inflightRefresh = null;
      }, REFRESH_RESULT_RETENTION_MS);
    });

  return flight;
}

/** Test seam: drops the retained refresh result so cases start clean. */
export function resetRefreshSingleFlight(): void {
  inflightRefresh = null;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const opts: RequestInit = {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  };

  let res = await fetch(`/api${path}`, opts);

  if (res.status === 401) {
    const refreshed = await refreshOnce();
    if (!refreshed) {
      window.location.assign('/login');
      // Never settles: the page is navigating away and callers must not
      // flash error state during the redirect.
      return new Promise<T>(() => {});
    }
    res = await fetch(`/api${path}`, opts);
  }

  if (!res.ok) throw new ApiError(res.status, await parseBody(res));
  return res.json() as Promise<T>;
}
