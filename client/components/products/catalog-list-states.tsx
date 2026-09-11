import { Package, ClipboardList } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

/** Shown while the products query is still pending and nothing's rendered
 * yet, instead of falling through to EmptyCatalogList's "No products found"
 * — that empty state was reused for "still loading" too (no isLoading check
 * existed before this), which reads as the whole catalog being blank/broken
 * for a moment on every load, especially the >1000-row stores this table is
 * built for. */
export function CatalogListSkeleton() {
  return (
    <div className="px-4 sm:px-0 py-3 sm:py-0 space-y-2 sm:space-y-0">
      {[...Array(8)].map((_, i) => (
        <div
          key={i}
          className="sm:grid sm:grid-cols-[1fr_110px_90px_90px_100px_90px] gap-2 items-center px-4 py-3 sm:py-2 sm:border-b sm:border-border rounded-xl sm:rounded-none border sm:border-t-0 sm:border-r-0"
        >
          <div className="flex items-center gap-3 sm:block">
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="hidden sm:block h-5 w-16 rounded-md" />
          <Skeleton className="hidden sm:block h-4 w-12" />
          <Skeleton className="hidden sm:block h-4 w-14" />
          <Skeleton className="hidden sm:block h-4 w-14" />
          <Skeleton className="hidden sm:block h-4 w-10" />
        </div>
      ))}
    </div>
  );
}

export function EmptyCatalogList({
  totalCount,
  isAdmin,
  isAuditor,
  onRequestProduct,
}: {
  totalCount: number;
  isAdmin: boolean;
  isAuditor: boolean;
  onRequestProduct: () => void;
}) {
  if (totalCount > 0) {
    return (
      <EmptyState
        icon={Package}
        title="No products found"
        description="Try adjusting your search or filters"
      />
    );
  }

  return (
    <EmptyState
      icon={Package}
      title="No products found"
      description="Get started by adding products to your catalog."
      action={
        isAdmin
          ? {
              label: "Create Purchase Order",
              href: "/procurement/new",
              icon: ClipboardList,
            }
          : isAuditor
            ? undefined
            : { label: "Request Product", onClick: onRequestProduct }
      }
    />
  );
}
