'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

/**
 * Shows the raw server message in development and a reference id in
 * production.
 *
 * Next.js already redacts the message on the server for production
 * error boundaries and hands over `digest` instead, so echoing
 * `error.message` verbatim produces "An error occurred in the Server
 * Components render" for the user and nothing actionable for support.
 * In development the real message is what you want on screen. Either
 * way the digest is the thing worth quoting in a ticket.
 */
export function ErrorCard({
  message,
  digest,
  reset,
}: {
  message: string;
  /** Next.js error digest; correlates with the server log line. */
  digest?: string;
  reset: () => void;
}) {
  const showDetail = process.env.NODE_ENV !== 'production';

  return (
    <Card className="mx-auto mt-12 max-w-md text-center">
      <p className="font-display text-lg font-semibold">Something went wrong</p>
      <p className="mt-2 text-sm text-ink-soft">
        {showDetail ? message : 'The page could not be loaded. Try again in a moment.'}
      </p>
      {digest && (
        <p className="mt-2 text-xs text-ink-soft">
          Reference <code className="font-mono">{digest}</code>
        </p>
      )}
      <Button variant="ghost" className="mt-4" onClick={reset}>
        Try again
      </Button>
    </Card>
  );
}
