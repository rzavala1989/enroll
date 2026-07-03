import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SectionSummary } from '@enroll/shared';

import { ToastProvider } from '@/components/toast';
import { ApiError, apiFetch } from '@/lib/api/client';

import { SectionSettings } from './section-settings';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  apiFetch: vi.fn(),
}));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const apiFetchMock = vi.mocked(apiFetch);

const section: SectionSummary = {
  id: 'sec-1',
  sectionNumber: '001',
  courseId: 'crs-1',
  courseCode: 'CS101',
  capacity: 30,
  enrolledCount: 25,
  seatsAvailable: 5,
  waitlistCount: 3,
  waitlistCap: 10,
};

function renderSettings() {
  return render(
    <ToastProvider>
      <SectionSettings section={section} />
    </ToastProvider>,
  );
}

describe('SectionSettings', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    refresh.mockReset();
  });

  it('prefills capacity and waitlist cap from the section', () => {
    renderSettings();
    expect(screen.getByLabelText(/capacity/i)).toHaveValue(30);
    expect(screen.getByLabelText(/waitlist cap/i)).toHaveValue(10);
  });

  it('saves capacity and waitlist cap, toasts, and refreshes on success', async () => {
    apiFetchMock.mockResolvedValueOnce({ ...section, capacity: 35, waitlistCap: 5 });
    const user = userEvent.setup();
    renderSettings();

    await user.clear(screen.getByLabelText(/capacity/i));
    await user.type(screen.getByLabelText(/capacity/i), '35');
    await user.clear(screen.getByLabelText(/waitlist cap/i));
    await user.type(screen.getByLabelText(/waitlist cap/i), '5');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(apiFetchMock).toHaveBeenCalledWith('/sections/sec-1', {
      method: 'PATCH',
      body: JSON.stringify({ capacity: 35, waitlistCap: 5 }),
    });
  });

  it('sends null waitlistCap when the field is cleared (unlimited)', async () => {
    apiFetchMock.mockResolvedValueOnce({ ...section, waitlistCap: null });
    const user = userEvent.setup();
    renderSettings();

    await user.clear(screen.getByLabelText(/waitlist cap/i));
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    expect(apiFetchMock).toHaveBeenCalledWith('/sections/sec-1', {
      method: 'PATCH',
      body: JSON.stringify({ capacity: 30, waitlistCap: null }),
    });
  });

  it('shows an inline alert on failure without refreshing', async () => {
    apiFetchMock.mockRejectedValueOnce(
      new ApiError(400, { code: 'CAPACITY_BELOW_ENROLLED', message: 'Capacity is below enrolled count.' }),
    );
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Capacity is below enrolled count.'),
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
