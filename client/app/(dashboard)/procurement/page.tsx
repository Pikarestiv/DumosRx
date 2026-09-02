import { ProcurementManagement } from "@/components/procurement"
import { LockedModuleOverlay } from "@/components/dashboard/locked-module-overlay"
import { RequireRole } from "@/components/auth/require-role"

export default function ProcurementPage() {
  return (
    <RequireRole>
      <div className="relative w-full h-full min-h-[500px]">
        <LockedModuleOverlay featureName="Procurement & Vendors" featureKey="procurement" />
        <ProcurementManagement initialTab="orders" />
      </div>
    </RequireRole>
  )
}
