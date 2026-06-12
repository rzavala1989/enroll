import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiFetch } from './client';

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
      expect.objectContaining({ headers: expect.objectContaining({ 'content-type': 'application/json' }) }),
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

    const err = await apiFetch('/enrollments', { method: 'POST', body: '{}' }).catch((e: unknown) => e) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.body).toEqual({ code: 'ALREADY_ENROLLED', message: 'nope' });
    expect(err.message).toBe('nope');
  });
});
