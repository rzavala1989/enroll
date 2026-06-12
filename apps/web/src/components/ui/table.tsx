import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-sm border border-line bg-card">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

/** Children must be a bare tr element, not the TR body-row component (TR adds a hover tint meant for data rows). */
export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-line bg-paper text-left text-xs uppercase tracking-wide text-ink-soft">
      {children}
    </thead>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-line">{children}</tbody>;
}

export function TR({ children }: { children: ReactNode }) {
  return <tr className="hover:bg-paper/60">{children}</tr>;
}

export function TH({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('px-3 py-2 font-semibold', className)} {...props} />;
}

export function TD({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-2 align-middle', className)} {...props} />;
}
