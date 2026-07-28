import { POSSystem } from "@/components/pos"
import { POSLoadingSkeleton } from "@/components/pos/pos-loading-skeleton"
import { Suspense } from "react"

export default function POSPage() {
  return (
    <>
      <Suspense fallback={<POSLoadingSkeleton />}>
        <POSSystem />
      </Suspense>
    </>
  )
}
