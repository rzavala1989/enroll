import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider, useToast } from './toast';

function Trigger() {
  const toast = useToast();
  return (
    <button
      onClick={() =>
        toast.push({
          kind: 'success',
          title: 'Enrolled',
          detail: '12 of 30 seats taken.',
        })
      }
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

  it('holds the toast open while it is hovered', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('fire'));

    // WCAG 2.2.1: five seconds is not enough to read a two-line message,
    // and there was no way to ask for more time.
    fireEvent.mouseEnter(screen.getByText('Enrolled').closest('div')!.parentElement!);
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(screen.getByText('Enrolled')).toBeInTheDocument();
  });

  it('holds the toast open while something inside it has focus', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('fire'));

    fireEvent.focus(screen.getByRole('button', { name: 'Dismiss: Enrolled' }));
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(screen.getByText('Enrolled')).toBeInTheDocument();
  });

  it('dismisses on demand without waiting out the timer', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('fire'));

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss: Enrolled' }));
    expect(screen.queryByText('Enrolled')).not.toBeInTheDocument();
  });
});
