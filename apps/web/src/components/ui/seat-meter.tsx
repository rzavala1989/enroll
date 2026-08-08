import { cn } from '@/lib/cn';
import { seatStatus } from '@/lib/seat-status';

const fillTone = {
  open: 'bg-open',
  'nearly-full': 'bg-amber',
  full: 'bg-full',
} as const;

/**
 * The product's core fact, diagrammed instead of only stated: a bar
 * showing how much of a section's capacity is taken, next to the
 * numbers it is drawn from. Reads at a glance in a table cell, and
 * still holds up next to a course-level total aggregated across many
 * sections, where the fraction carries more of the meaning than the
 * bar's precision can.
 */
export function SeatMeter({
  enrolled,
  capacity,
  waitlistCount,
  className,
}: {
  enrolled: number;
  capacity: number;
  waitlistCount?: number;
  className?: string;
}) {
  const open = Math.max(capacity - enrolled, 0);
  const status = seatStatus(open, capacity);
  const pct = capacity > 0 ? Math.min(enrolled / capacity, 1) * 100 : 0;

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        role="img"
        aria-label={`${enrolled} of ${capacity} seats taken`}
        className="relative h-2.5 w-11 shrink-0 overflow-hidden rounded-[2px] border border-line-strong bg-paper"
      >
        <span
          aria-hidden="true"
          className={cn('absolute inset-y-0 left-0', fillTone[status])}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="font-mono text-xs tabular-nums text-ink-soft">
        {enrolled}/{capacity}
      </span>
      {Boolean(waitlistCount) && (
        <span className="font-mono text-xs tabular-nums text-wait">+{waitlistCount}</span>
      )}
    </span>
  );
}
