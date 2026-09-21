import { Skeleton } from '@arena/ui';

/** Mirrors the overview layout: header, stat row, list of rows. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-2 h-9 w-64" />
      <Skeleton className="mb-8 h-4 w-96 max-w-full" />
      <div className="mb-10 flex gap-10">
        <Skeleton className="h-14 w-24" />
        <Skeleton className="h-14 w-24" />
      </div>
      <div className="divide-y divide-line rounded-lg border border-line">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-4 p-4">
            <Skeleton className="size-10" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
