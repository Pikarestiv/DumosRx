import { CARD_SURFACE } from "@/lib/storefront-styles";
import { cn } from "@/lib/utils";

const PLACEHOLDER_COUNT = 8;

export function ProductGridSkeleton({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading products"
      className={cn("grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4", className)}
    >
      {Array.from({ length: PLACEHOLDER_COUNT }, (_, index) => (
        <div key={index} aria-hidden="true" className={cn("animate-pulse", CARD_SURFACE)}>
          <div className="aspect-[4/3] bg-black/10" />
          <div className="space-y-3 p-4">
            <div className="h-4 w-3/4 rounded bg-black/10" />
            <div className="h-5 w-1/3 rounded bg-black/10" />
          </div>
        </div>
      ))}
    </div>
  );
}
