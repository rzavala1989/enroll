import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/components/toast';
import { ApiError, apiFetch } from '@/lib/api/client';

import { MarkAllReadButton } from './mark-all-read-button';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  apiFetch: vi.fn(),
}));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const apiFetchMock = vi.mocked(apiFetch);

function renderButton(unreadCount = 3) {
  return render(
    <ToastProvider>
      <MarkAllReadButton unreadCount={unreadCount} />
    </ToastProvider>,
  );
}

describe('MarkAllReadButton', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    refresh.mockReset();
  });

  it('is disabled when there are no unread notifications', () => {
    renderButton(0);
    expect(screen.getByRole('button', { name: /mark all read/i })).toBeDisabled();
  });

  it('marks everything read and refreshes on success', async () => {
    apiFetchMock.mockResolvedValueOnce({ updated: 3 });
    const user = userEvent.setup();
    renderButton(3);

    await user.click(screen.getByRole('button', { name: /mark all read/i }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(apiFetchMock).toHaveBeenCalledWith('/notifications/read-all', { method: 'POST' });
  });

  it('shows an inline error on failure without refreshing', async () => {
    apiFetchMock.mockRejectedValueOnce(new ApiError(500, { message: 'server exploded' }));
    const user = userEvent.setup();
    renderButton(3);

    await user.click(screen.getByRole('button', { name: /mark all read/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('server exploded'));
    expect(refresh).not.toHaveBeenCalled();
  });
});
