import { Skeleton } from '@/components/ui/skeleton';

export default function CourseLoading() {
  return (
    <div>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-9 w-96" />
      <Skeleton className="mt-3 h-4 w-full max-w-2xl" />
      <Skeleton className="mt-8 h-64 w-full" />
    </div>
  );
}
