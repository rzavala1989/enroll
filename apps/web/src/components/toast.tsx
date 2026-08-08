'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface ToastInput {
  kind: 'success' | 'error' | 'info';
  title: string;
  detail?: string;
}

interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<{ push: (t: ToastInput) => void } | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

const kindStyles: Record<ToastInput['kind'], string> = {
  success: 'bg-open-soft text-open',
  error: 'bg-full-soft text-full',
  info: 'bg-wait-soft text-wait',
};

const kindDot: Record<ToastInput['kind'], string> = {
  success: 'bg-open',
  error: 'bg-full',
  info: 'bg-wait',
};

const kindRole: Record<ToastInput['kind'], 'status' | 'alert'> = {
  success: 'status',
  error: 'alert',
  info: 'status',
};

const AUTO_DISMISS_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [paused, setPaused] = useState(false);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((t: ToastInput) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { ...t, id }]);
  }, []);

  /**
   * Auto-dismiss, halted while the stack has pointer or keyboard focus.
   *
   * WCAG 2.2.1 wants time limits to be adjustable, and five seconds is
   * not enough to read a two-line message, let alone one being read
   * aloud. Pausing on hover and focus, plus an explicit dismiss, covers
   * it without giving up the auto-dismiss that keeps the corner clear.
   *
   * The timer restarts from the top when the stack changes rather than
   * tracking per-toast deadlines: the whole stack is dismissed oldest
   * first anyway, and one timer is far less to get wrong.
   */
  useEffect(() => {
    if (paused || toasts.length === 0) return;
    const oldest = toasts[0].id;
    const timer = setTimeout(() => dismiss(oldest), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toasts, paused, dismiss]);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={kindRole[t.kind]}
            className={cn(
              'pointer-events-auto flex items-start gap-2.5 rounded-sm border border-line p-3 shadow-sm',
              kindStyles[t.kind],
            )}
          >
            <span
              aria-hidden="true"
              className={cn('mt-1.5 h-2 w-2 shrink-0', kindDot[t.kind])}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t.title}</p>
              {t.detail && <p className="mt-0.5 text-xs text-ink-soft">{t.detail}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label={`Dismiss: ${t.title}`}
              className="-mr-1 -mt-1 rounded-sm px-1.5 py-0.5 text-lg leading-none opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
