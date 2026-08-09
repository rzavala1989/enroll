import { Skeleton } from '@/components/ui/skeleton';

export default function CatalogLoading() {
  return (
    <div className="mx-auto max-w-6xl pb-12 pt-6">
      <Skeleton className="h-10 w-48 mb-6" />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Left Table Skeleton */}
        <div className="lg:col-span-8">
          <div className="rounded-sm border border-line bg-card overflow-hidden">
            <div className="border-b border-line p-4 flex gap-4">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-6 w-16" />
            </div>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="border-b border-line p-4 flex gap-4">
                <div className="flex flex-col gap-2 w-full">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-1/3" />
                </div>
                <div className="w-32 flex flex-col items-end gap-2 shrink-0">
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Drawer Skeleton */}
        <div className="lg:col-span-4 sticky top-6">
          <div className="rounded-sm border border-line bg-card p-5">
            <Skeleton className="h-6 w-3/4 mb-2" />
            <Skeleton className="h-4 w-1/2 mb-6" />

            <div className="space-y-4">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="flex justify-between border-b border-line pb-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
