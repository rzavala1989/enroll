import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiFetch, resetRefreshSingleFlight } from './client';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('apiFetch', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    resetRefreshSingleFlight();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns parsed JSON on success', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await expect(apiFetch('/courses')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/courses',
      expect.objectContaining({
        headers: expect.objectContaining({ 'content-type': 'application/json' }),
      }),
    );
  });

  it('refreshes once on 401 and replays the request', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { message: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(200, { message: 'Token refreshed' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await expect(apiFetch('/enrollments')).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/auth/refresh',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock.mock.calls[0][0]).toBe('/api/enrollments');
    expect(fetchMock.mock.calls[2][0]).toBe('/api/enrollments');
  });

  /**
   * Every distinct path 401s once, then succeeds. Refresh always
   * succeeds. Routing by URL rather than call order keeps the
   * expectations stable regardless of how the parallel calls interleave.
   */
  function routeWithOne401PerPath(onRefresh: () => void) {
    const already401ed = new Set<string>();
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/auth/refresh') {
        onRefresh();
        return jsonResponse(200, { message: 'Token refreshed' });
      }
      if (!already401ed.has(url)) {
        already401ed.add(url);
        return jsonResponse(401, { message: 'expired' });
      }
      return jsonResponse(200, { path: url });
    });
  }

  it('collapses parallel 401s into one refresh and replays each caller', async () => {
    let refreshCalls = 0;
    routeWithOne401PerPath(() => {
      refreshCalls += 1;
    });

    const results = await Promise.all([
      apiFetch('/enrollments'),
      apiFetch('/notifications'),
      apiFetch('/courses'),
    ]);

    // The whole point: three 401s spend the refresh cookie once. A
    // second POST would arrive with the rotated-away token, the API
    // would read it as reuse, and the family would be revoked.
    expect(refreshCalls).toBe(1);
    expect(results).toEqual([
      { path: '/api/enrollments' },
      { path: '/api/notifications' },
      { path: '/api/courses' },
    ]);
  });

  it('starts a fresh refresh once the retention window lapses', async () => {
    vi.useFakeTimers();
    try {
      let refreshCalls = 0;
      routeWithOne401PerPath(() => {
        refreshCalls += 1;
      });

      await apiFetch('/enrollments');
      expect(refreshCalls).toBe(1);

      // Still inside the retention window: the retained success covers
      // this straggler, whose cookie jar may not have caught up yet.
      await apiFetch('/notifications');
      expect(refreshCalls).toBe(1);

      await vi.advanceTimersByTimeAsync(300);

      await apiFetch('/courses');
      expect(refreshCalls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects every awaiting caller when the refresh request itself errors', async () => {
    const network = new Error('offline');
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/auth/refresh') throw network;
      return jsonResponse(401, {});
    });

    await expect(
      Promise.all([apiFetch('/enrollments'), apiFetch('/notifications')]),
    ).rejects.toBe(network);
  });

  it('redirects to /login when the refresh also fails', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(401, {}));
    const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});

    void apiFetch('/enrollments').catch(() => {});
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/login'));
  });

  it('throws ApiError carrying status and body for non-401 failures', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, { code: 'ALREADY_ENROLLED', message: 'nope' }),
    );

    const err = (await apiFetch('/enrollments', { method: 'POST', body: '{}' }).catch(
      (e: unknown) => e,
    )) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.body).toEqual({ code: 'ALREADY_ENROLLED', message: 'nope' });
    expect(err.message).toBe('nope');
  });
});
