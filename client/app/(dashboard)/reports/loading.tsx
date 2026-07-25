import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex flex-col md:flex-row md:items-center gap-2.5 mb-5">
        <Skeleton className="h-11 w-full md:w-96 rounded-[11px]" />
        <Skeleton className="h-10 w-40 rounded-md" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[360px] w-full rounded-md" />
    </div>
  );
}
