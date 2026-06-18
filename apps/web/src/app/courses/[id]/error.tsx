'use client';

import { ErrorCard } from '@/components/error-card';

export default function CourseError({ error, reset }: { error: Error; reset: () => void }) {
  return <ErrorCard message={error.message} reset={reset} />;
}
