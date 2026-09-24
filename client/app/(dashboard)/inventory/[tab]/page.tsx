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
      {/* The page design has no title slot; a top-level heading is still
          required for screen-reader/landmark navigation (WCAG 1.3.1/2.4.6). */}
      <h1 className="sr-only">Inventory</h1>
      <StockBatchManagement currentTab={resolvedParams.tab} />
    </>
  )
}
