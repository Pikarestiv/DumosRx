import { POSSystem } from "@/components/pos/pos-system"
import { Suspense } from "react"

export default function POSPage() {
  return (
    <>
      <Suspense fallback={<div>Loading POS...</div>}>
        <POSSystem />
      </Suspense>
    </>
  )
}
