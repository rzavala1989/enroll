import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WaitlistEntry } from '@enroll/shared';

import { ToastProvider } from '@/components/toast';
import { ApiError, apiFetch } from '@/lib/api/client';

import { WaitlistReorder } from './waitlist-reorder';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  apiFetch: vi.fn(),
}));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const apiFetchMock = vi.mocked(apiFetch);

const entries: WaitlistEntry[] = [
  { position: 1, enrollmentId: 'e1', studentId: 's1', firstName: 'Ada', lastName: 'Lovelace', joinedAt: '2026-01-01T00:00:00.000Z' },
  { position: 2, enrollmentId: 'e2', studentId: 's2', firstName: 'Grace', lastName: 'Hopper', joinedAt: '2026-01-02T00:00:00.000Z' },
  { position: 3, enrollmentId: 'e3', studentId: 's3', firstName: 'Alan', lastName: 'Turing', joinedAt: '2026-01-03T00:00:00.000Z' },
];

function renderReorder() {
  return render(
    <ToastProvider>
      <WaitlistReorder sectionId="sec-1" entries={entries} />
    </ToastProvider>,
  );
}

describe('WaitlistReorder', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    refresh.mockReset();
  });

  it('renders rows in position order', () => {
    renderReorder();
    const rows = screen.getAllByRole('row').slice(1); // skip header row
    expect(rows[0]).toHaveTextContent('Ada Lovelace');
    expect(rows[1]).toHaveTextContent('Grace Hopper');
    expect(rows[2]).toHaveTextContent('Alan Turing');
  });

  it('moves a row up and saves the new order', async () => {
    apiFetchMock.mockResolvedValueOnce(entries);
    const user = userEvent.setup();
    renderReorder();

    await user.click(screen.getByRole('button', { name: /move grace hopper up/i }));
    await user.click(screen.getByRole('button', { name: /save order/i }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(apiFetchMock).toHaveBeenCalledWith('/sections/sec-1/waitlist', {
      method: 'PATCH',
      body: JSON.stringify({ orderedEnrollmentIds: ['e2', 'e1', 'e3'] }),
    });
  });

  it('disables the up button on the first row and the down button on the last row', () => {
    renderReorder();
    expect(screen.getByRole('button', { name: /move ada lovelace up/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /move alan turing down/i })).toBeDisabled();
  });

  it('surfaces a stale-waitlist message with a refresh action on 409 WAITLIST_CHANGED', async () => {
    apiFetchMock.mockRejectedValueOnce(
      new ApiError(409, { code: 'WAITLIST_CHANGED', message: 'stale' }),
    );
    const user = userEvent.setup();
    renderReorder();

    await user.click(screen.getByRole('button', { name: /save order/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/waitlist changed/i));
    await user.click(screen.getByRole('button', { name: /refresh/i }));
    expect(refresh).toHaveBeenCalled();
  });

  it('shows a generic inline error for other failures', async () => {
    apiFetchMock.mockRejectedValueOnce(new ApiError(500, { message: 'server exploded' }));
    const user = userEvent.setup();
    renderReorder();

    await user.click(screen.getByRole('button', { name: /save order/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('server exploded'));
  });
});
