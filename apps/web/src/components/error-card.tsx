'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function ErrorCard({ message, reset }: { message: string; reset: () => void }) {
  return (
    <Card className="mx-auto mt-12 max-w-md text-center">
      <p className="font-display text-lg font-semibold">Something went wrong</p>
      <p className="mt-2 text-sm text-ink-soft">{message}</p>
      <Button variant="ghost" className="mt-4" onClick={reset}>
        Try again
      </Button>
    </Card>
  );
}
