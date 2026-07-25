import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the PO builder's header + two-pane layout (procurement/new, procurement/edit). */
export function POFormSkeleton() {
  return (
    <div className="flex flex-col bg-card border border-border rounded-2xl overflow-hidden h-[calc(100vh-120px)] shadow-sm animate-pulse">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-border shrink-0">
        <Skeleton className="w-[38px] h-[38px] rounded-[10px]" />
        <div>
          <Skeleton className="h-5 w-48 mb-2" />
          <Skeleton className="h-3.5 w-64" />
        </div>
        <Skeleton className="ml-auto h-4 w-24" />
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_380px] min-h-0">
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
        <div className="p-6 border-t md:border-t-0 md:border-l border-border space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
