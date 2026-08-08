import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface EmptyStateFact {
  label: string;
  value: ReactNode;
}

/**
 * Text-forward empty state.
 *
 * The pattern this replaces was a centered card with one gray sentence,
 * repeated on four screens. It reads as an apology and it teaches
 * nothing: a student who lands on an empty enrollments page learns
 * neither what would appear there nor how to get something into it.
 *
 * So: left-aligned like the content it stands in for, a heading that
 * states the situation rather than performing regret, one line of
 * explanation about what this surface holds, an optional fact list
 * carrying the context that made it empty (which filters are on, how
 * many seats the section has), and a real action.
 *
 * No illustration. The empty state is an on-ramp, not a museum exhibit,
 * and this much vertical space spent on a drawing is space not spent
 * telling the user what to do.
 */
export function EmptyState({
  title,
  body,
  facts,
  action,
  className,
}: {
  title: string;
  body: ReactNode;
  /** Context that explains the emptiness: active filters, section capacity. */
  facts?: EmptyStateFact[];
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-sm border border-line bg-card p-5', className)}>
      <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
      <p className="mt-1 max-w-prose text-sm text-ink-soft">{body}</p>

      {facts && facts.length > 0 && (
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-3">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt className="text-xs uppercase tracking-wide text-ink-soft">
                {fact.label}
              </dt>
              <dd className="mt-0.5 text-sm font-medium">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {action && <div className="mt-4 flex flex-wrap items-center gap-2">{action}</div>}
    </section>
  );
}
