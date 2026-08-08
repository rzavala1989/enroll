/** Four seats, one taken. The product in a mark: a room, and whether there's room in it. */
export function CrestMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="5" fill="var(--color-pine)" />
      <rect x="5" y="5" width="6" height="6" rx="1.5" fill="var(--color-paper)" />
      <rect x="13" y="5" width="6" height="6" rx="1.5" fill="var(--color-paper)" />
      <rect x="5" y="13" width="6" height="6" rx="1.5" fill="var(--color-paper)" />
      <rect x="13" y="13" width="6" height="6" rx="1.5" fill="var(--color-amber)" />
    </svg>
  );
}
