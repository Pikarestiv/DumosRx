import { ProcurementManagement } from "@/components/procurement"
import { LockedModuleOverlay } from "@/components/dashboard/locked-module-overlay"

export default function ProcurementPage() {
  return (
    <>
      <div className="relative w-full h-full min-h-[500px]">
        <LockedModuleOverlay featureName="Procurement & Vendors" featureKey="procurement" />
        <ProcurementManagement initialTab="orders" />
      </div>
    </>
  )
}
