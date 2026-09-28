import { ProcurementManagement } from "@/components/procurement"
import { LockedModuleOverlay } from "@/components/dashboard/locked-module-overlay"
import { RequireRole } from "@/components/auth/require-role"

export default function VendorsPage() {
  return (
    <RequireRole permission="view_suppliers">
      <div className="relative w-full h-full min-h-[500px]">
        <LockedModuleOverlay featureName="Procurement & Vendors" featureKey="procurement" />
        <ProcurementManagement initialTab="suppliers" />
      </div>
    </RequireRole>
  )
}
