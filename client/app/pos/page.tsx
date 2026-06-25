import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { POSSystem } from "@/components/pos/pos-system"
import { Suspense } from "react"

export default function POSPage() {
  return (
    <DashboardLayout>
      <Suspense fallback={<div>Loading POS...</div>}>
        <POSSystem />
      </Suspense>
    </DashboardLayout>
  )
}
