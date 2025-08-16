import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { PrescriptionManagement } from "@/components/prescriptions/prescription-management"

export default function PrescriptionsPage() {
  return (
    <DashboardLayout>
      <PrescriptionManagement />
    </DashboardLayout>
  )
}
