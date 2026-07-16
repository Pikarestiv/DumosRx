import { StockBatchManagement } from "@/components/stock-batch/stock-batch-management"
import { redirect } from "next/navigation"

export function generateStaticParams() {
  const allowedTabs = ["overview", "products", "batches", "movements", "adjustments"]
  return allowedTabs.map((tab) => ({
    tab,
  }))
}

export default async function InventoryTabPage({ params }: { params: Promise<{ tab: string }> }) {
  const resolvedParams = await params;
  const allowedTabs = ["overview", "products", "batches", "movements", "adjustments"]
  
  if (!allowedTabs.includes(resolvedParams.tab)) {
    redirect("/inventory/overview")
  }

  return (
    <>
      <StockBatchManagement currentTab={resolvedParams.tab} />
    </>
  )
}
