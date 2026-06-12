import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider, useToast } from './toast';

function Trigger() {
  const toast = useToast();
  return (
    <button
      onClick={() => toast.push({ kind: 'success', title: 'Enrolled', detail: '12 of 30 seats taken.' })}
    >
      fire
    </button>
  );
}

describe('toast', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renders a pushed toast and auto-dismisses it after 5 seconds', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText('fire'));
    expect(screen.getByText('Enrolled')).toBeInTheDocument();
    expect(screen.getByText('12 of 30 seats taken.')).toBeInTheDocument();

    await act(async () => vi.advanceTimersByTime(5100));
    expect(screen.queryByText('Enrolled')).not.toBeInTheDocument();
  });
});
