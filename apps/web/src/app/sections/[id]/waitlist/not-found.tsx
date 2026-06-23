import Link from 'next/link';

import { Card } from '@/components/ui/card';

export default function WaitlistNotFound() {
  return (
    <Card className="mx-auto mt-12 max-w-md text-center">
      <p className="font-display text-lg font-semibold">Section not found</p>
      <p className="mt-2 text-sm text-ink-soft">It may have been removed from the active term.</p>
      <Link href="/catalog" className="mt-4 inline-block text-sm text-pine underline">
        Back to catalog
      </Link>
    </Card>
  );
}
