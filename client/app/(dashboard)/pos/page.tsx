import { POSSystem } from "@/components/pos"
import { POSLoadingSkeleton } from "@/components/pos/pos-loading-skeleton"
import { LockedModuleOverlay } from "@/components/dashboard/locked-module-overlay"
import { Suspense } from "react"

export default function POSPage() {
  return (
    <div className="relative w-full h-full min-h-[500px]">
      <LockedModuleOverlay featureName="Point of Sale" featureKey="smart_pos" />
      <Suspense fallback={<POSLoadingSkeleton />}>
        <POSSystem />
      </Suspense>
    </div>
  )
}
