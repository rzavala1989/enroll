import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/components/toast';
import { ApiError, apiFetch } from '@/lib/api/client';

import { EnrollButton } from './enroll-button';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  apiFetch: vi.fn(),
}));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const apiFetchMock = vi.mocked(apiFetch);

function renderButton(full = false) {
  return render(
    <ToastProvider>
      <EnrollButton sectionId="sec-1" full={full} />
    </ToastProvider>,
  );
}

describe('EnrollButton', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    refresh.mockReset();
  });

  it('labels by seat availability', () => {
    renderButton(false);
    expect(screen.getByRole('button', { name: 'Enroll' })).toBeInTheDocument();
  });

  it('labels full sections as join waitlist', () => {
    renderButton(true);
    expect(screen.getByRole('button', { name: 'Join waitlist' })).toBeInTheDocument();
  });

  it('shows enrolled state and refreshes on success', async () => {
    apiFetchMock.mockResolvedValueOnce({
      status: 'ENROLLED',
      sectionEnrolledCount: 12,
      sectionCapacity: 30,
    });
    const user = userEvent.setup();
    renderButton(false);

    await user.click(screen.getByRole('button', { name: 'Enroll' }));

    await waitFor(() => expect(screen.getByText('Enrolled')).toBeInTheDocument());
    expect(refresh).toHaveBeenCalled();
    expect(apiFetchMock).toHaveBeenCalledWith('/enrollments', {
      method: 'POST',
      body: JSON.stringify({ sectionId: 'sec-1' }),
    });
  });

  it('shows the waitlist position when waitlisted', async () => {
    apiFetchMock.mockResolvedValueOnce({
      status: 'WAITLISTED',
      waitlistPosition: 4,
      sectionEnrolledCount: 30,
      sectionCapacity: 30,
    });
    const user = userEvent.setup();
    renderButton(true);

    await user.click(screen.getByRole('button', { name: 'Join waitlist' }));

    await waitFor(() => expect(screen.getByText('Waitlisted, #4 in line')).toBeInTheDocument());
  });

  it('maps failure codes to inline messages', async () => {
    apiFetchMock.mockRejectedValueOnce(
      new ApiError(409, { code: 'ALREADY_ENROLLED', message: 'raw api text' }),
    );
    const user = userEvent.setup();
    renderButton(false);

    await user.click(screen.getByRole('button', { name: 'Enroll' }));

    await waitFor(() =>
      expect(screen.getByText('You are already enrolled in this section.')).toBeInTheDocument(),
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
