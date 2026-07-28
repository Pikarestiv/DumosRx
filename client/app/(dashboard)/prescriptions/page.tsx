import { PrescriptionManagement } from "@/components/prescriptions"
import { LockedModuleOverlay } from "@/components/dashboard/locked-module-overlay"

export default function PrescriptionsPage() {
  return (
    <>
      <div className="relative w-full h-full min-h-[500px]">
        <LockedModuleOverlay featureName="Prescriptions" featureKey="prescriptions" />
        <PrescriptionManagement />
      </div>
    </>
  )
}
