import { StockBatchManagement } from "@/components/stock-batch"
import { redirect } from "next/navigation"

export function generateStaticParams() {
  const allowedTabs = ["overview", "catalog", "batches", "ledger", "audits"]
  return allowedTabs.map((tab) => ({
    tab,
  }))
}

export default async function InventoryTabPage({ params }: { params: Promise<{ tab: string }> }) {
  const resolvedParams = await params;
  const allowedTabs = ["overview", "catalog", "batches", "ledger", "audits"]
  
  if (!allowedTabs.includes(resolvedParams.tab)) {
    redirect("/inventory/overview")
  }

  return (
    <>
      <StockBatchManagement currentTab={resolvedParams.tab} />
    </>
  )
}
