import { ProcurementManagement } from "@/components/procurement"
import { LockedModuleOverlay } from "@/components/dashboard/locked-module-overlay"
import { RequireRole } from "@/components/auth/require-role"

export default function ProcurementPage() {
  return (
    <RequireRole>
      {/* The page design has no title slot; a top-level heading is still
          required for screen-reader/landmark navigation (WCAG 1.3.1/2.4.6). */}
      <h1 className="sr-only">Procurement & Vendors</h1>
      <div className="relative w-full h-full min-h-[500px]">
        <LockedModuleOverlay featureName="Procurement & Vendors" featureKey="procurement" />
        <ProcurementManagement initialTab="orders" />
      </div>
    </RequireRole>
  )
}
