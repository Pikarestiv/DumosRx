import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <div className="max-w-5xl animate-pulse">
        {/* Header Skeleton */}
        <div className="mb-6 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <Skeleton className="h-9 w-40 mb-2" />
            <Skeleton className="h-5 w-72" />
          </div>
          <Skeleton className="h-8 w-48 rounded-full" />
        </div>

        <div className="flex flex-col md:flex-row gap-6 md:gap-8 md:items-start">
          {/* Vertical Sidebar Tabs Skeleton */}
          <aside className="w-full md:w-48 flex-shrink-0 flex flex-col gap-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </aside>

          {/* Main Content Area Skeleton */}
          <div className="flex-1 min-w-0 space-y-6">
            <Skeleton className="h-[200px] w-full rounded-lg" />
            <Skeleton className="h-[300px] w-full rounded-lg" />
            <Skeleton className="h-[150px] w-full rounded-lg" />
          </div>
        </div>
      </div>
    </>
  );
}
