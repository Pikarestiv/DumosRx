import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the POS shell (header + product grid + cart panel) so the route/chunk
 * loading boundary doesn't flash a mismatched layout before POSSystem mounts. */
export function POSLoadingSkeleton() {
  return (
    <div className="flex flex-col lg:flex-row w-full h-[calc(100dvh-0px)] overflow-hidden animate-pulse">
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <div className="h-16 px-4 sm:px-6 flex items-center gap-3 border-b border-border/50 shrink-0">
          <Skeleton className="h-9 w-9 rounded-xl md:hidden" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="hidden sm:block h-10 flex-1 max-w-md rounded-xl ml-6" />
          <div className="flex items-center gap-2 ml-auto">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <Skeleton className="h-10 w-10 rounded-xl" />
          </div>
        </div>
        <div className="p-4 sm:p-6 flex-1 overflow-hidden flex flex-col gap-4">
          <Skeleton className="h-10 w-48 rounded-lg" />
          <div className="flex gap-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-20 rounded-full shrink-0" />
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-[100px] sm:h-[120px] w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
      <div className="hidden lg:flex lg:w-[380px] xl:w-[420px] shrink-0 flex-col border-l border-border p-4 gap-4">
        <Skeleton className="h-12 w-full rounded-lg" />
        <div className="flex-1 space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    </div>
  );
}
