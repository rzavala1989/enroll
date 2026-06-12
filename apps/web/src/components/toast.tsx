'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
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
  success: 'border-open bg-open-soft text-open',
  error: 'border-full bg-full-soft text-full',
  info: 'border-wait bg-wait-soft text-wait',
};

const kindRole: Record<ToastInput['kind'], 'status' | 'alert'> = {
  success: 'status',
  error: 'alert',
  info: 'status',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const push = useCallback((t: ToastInput) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={kindRole[t.kind]}
            className={cn('rounded-sm border-l-4 p-3 shadow-md', kindStyles[t.kind])}
          >
            <p className="text-sm font-semibold">{t.title}</p>
            {t.detail && <p className="mt-0.5 text-xs text-ink-soft">{t.detail}</p>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
