import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { StockBatchManagement } from "@/components/stock-batch/stock-batch-management"

export default function StockBatchPage() {
  return (
    <DashboardLayout>
      <StockBatchManagement />
    </DashboardLayout>
  )
}
