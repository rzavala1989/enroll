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

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const opts: RequestInit = {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  };

  let res = await fetch(`/api${path}`, opts);

  if (res.status === 401) {
    const refreshed = await fetch('/api/auth/refresh', { method: 'POST' });
    if (!refreshed.ok) {
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
