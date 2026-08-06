'use client';

import { ErrorCard } from '@/components/error-card';

export default function CourseError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorCard message={error.message} digest={error.digest} reset={reset} />;
}
