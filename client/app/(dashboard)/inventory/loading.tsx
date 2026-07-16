import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <div className="space-y-6 animate-pulse">
        {/* Header Skeleton */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <Skeleton className="h-9 w-48 mb-2" />
            <Skeleton className="h-5 w-72" />
          </div>
          <Skeleton className="h-11 w-40" />
        </div>

        {/* Tabs List Skeleton */}
        <div className="flex gap-2 border-b pb-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>

        {/* Content Skeleton (Table/Cards) */}
        <div className="space-y-4 pt-4">
          <div className="flex justify-between items-center">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-10 w-32" />
          </div>
          <Skeleton className="h-[400px] w-full rounded-md" />
        </div>
      </div>
    </>
  );
}
