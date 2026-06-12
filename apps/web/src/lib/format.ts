const dateTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  // Bad input renders as-is instead of throwing inside a Server Component.
  if (Number.isNaN(d.getTime())) return iso;
  return dateTime.format(d);
}
