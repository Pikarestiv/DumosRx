import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { ProcurementManagement } from "@/components/procurement/procurement-management"

export default function ProcurementPage() {
  return (
    <DashboardLayout>
      <ProcurementManagement />
    </DashboardLayout>
  )
}
