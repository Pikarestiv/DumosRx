import { ProcurementManagement } from "@/components/procurement/procurement-management"
import { LockedModuleOverlay } from "@/components/dashboard/locked-module-overlay"

export default function RequestsPage() {
  return (
    <>
      <div className="relative w-full h-full min-h-[500px]">
        <LockedModuleOverlay featureName="Procurement & Vendors" featureKey="procurement" />
        <ProcurementManagement initialTab="requests" />
      </div>
    </>
  )
}
