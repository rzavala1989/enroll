import type { ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

type Variant = 'primary' | 'ghost' | 'danger';

const styles: Record<Variant, string> = {
  primary:
    'bg-pine text-paper hover:bg-pine-dark disabled:bg-ink-soft border border-pine hover:border-pine-dark',
  ghost:
    'bg-transparent text-pine border border-pine/40 hover:border-pine hover:bg-pine-soft disabled:text-ink-soft disabled:border-line',
  danger:
    'bg-transparent text-full border border-full/40 hover:bg-full-soft hover:border-full disabled:text-ink-soft disabled:border-line',
};

export function Button({
  variant = 'primary',
  type = 'button',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium',
        'transition-colors disabled:cursor-not-allowed',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2',
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}
