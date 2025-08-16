import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { InventoryManagement } from "@/components/inventory/inventory-management"

export default function InventoryPage() {
  return (
    <DashboardLayout>
      <InventoryManagement />
    </DashboardLayout>
  )
}
