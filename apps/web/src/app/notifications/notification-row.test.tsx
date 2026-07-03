import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationItem } from '@enroll/shared';

import { ToastProvider } from '@/components/toast';
import { ApiError, apiFetch } from '@/lib/api/client';

import { NotificationRow } from './notification-row';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  apiFetch: vi.fn(),
}));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const apiFetchMock = vi.mocked(apiFetch);

const unread: NotificationItem = {
  id: 'n1',
  type: 'WAITLIST_PROMOTED',
  title: 'You were enrolled from the waitlist',
  body: 'A seat opened in CS101 section 001.',
  readAt: null,
  createdAt: '2026-07-01T10:00:00.000Z',
};

const read: NotificationItem = { ...unread, id: 'n2', readAt: '2026-07-02T10:00:00.000Z' };

function renderRow(notification: NotificationItem) {
  return render(
    <ToastProvider>
      <NotificationRow notification={notification} />
    </ToastProvider>,
  );
}

describe('NotificationRow', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    refresh.mockReset();
  });

  it('shows a mark-read button for an unread notification', () => {
    renderRow(unread);
    expect(screen.getByRole('button', { name: /mark read/i })).toBeInTheDocument();
  });

  it('shows no mark-read button for an already-read notification', () => {
    renderRow(read);
    expect(screen.queryByRole('button', { name: /mark read/i })).not.toBeInTheDocument();
  });

  it('marks read and refreshes on click', async () => {
    apiFetchMock.mockResolvedValueOnce({ ...unread, readAt: '2026-07-02T10:00:00.000Z' });
    const user = userEvent.setup();
    renderRow(unread);

    await user.click(screen.getByRole('button', { name: /mark read/i }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(apiFetchMock).toHaveBeenCalledWith('/notifications/n1/read', { method: 'PATCH' });
  });

  it('shows an inline error on failure without refreshing', async () => {
    apiFetchMock.mockRejectedValueOnce(new ApiError(500, { message: 'server exploded' }));
    const user = userEvent.setup();
    renderRow(unread);

    await user.click(screen.getByRole('button', { name: /mark read/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('server exploded'));
    expect(refresh).not.toHaveBeenCalled();
  });
});
