import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export type BadgeTone = 'pine' | 'amber' | 'open' | 'full' | 'wait' | 'neutral';

const tones: Record<BadgeTone, string> = {
  pine: 'bg-pine-soft text-pine-dark',
  amber: 'bg-amber-soft text-amber',
  open: 'bg-open-soft text-open',
  full: 'bg-full-soft text-full',
  wait: 'bg-wait-soft text-wait',
  neutral: 'bg-line/60 text-ink-soft',
};

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
