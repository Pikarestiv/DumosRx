import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { ProcurementManagement } from "@/components/procurement/procurement-management"
import { LockedModuleOverlay } from "@/components/dashboard/locked-module-overlay"

export default function ProcurementPage() {
  return (
    <DashboardLayout>
      <div className="relative w-full h-full min-h-[500px]">
        <LockedModuleOverlay featureName="Procurement & Vendors" featureKey="procurement" />
        <ProcurementManagement />
      </div>
    </DashboardLayout>
  )
}
