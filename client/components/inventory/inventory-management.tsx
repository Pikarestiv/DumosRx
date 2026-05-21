"use client"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { StockOverview } from "./stock-overview"
import { StockMovements } from "./stock-movements"
import { StockAdjustments } from "./stock-adjustments"
import { BatchTracking } from "./batch-tracking"
import { MedicineDatabase } from "@/components/medicines/medicine-database"
import { Button } from "@/components/ui/button"
import { ClipboardCheck } from "lucide-react"
import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { StockAuditDialog } from "./stock-audit-dialog"
import { ExpiringBatchesAlert } from "./expiring-batches-alert"
import { useStore } from "@/lib/context/store-context"

export function InventoryManagement() {
  const [isAuditOpen, setIsAuditOpen] = useState(false)
  const { t } = useStore()
  const searchParams = useSearchParams()

  // If navigated here with ?action=add or ?status=low_stock, land on the products tab
  const hasProductsParam = searchParams.get("action") === "add" || !!searchParams.get("status")
  const defaultTab = hasProductsParam ? "products" : "products"

  return (
    <div className="space-y-6">
      <ExpiringBatchesAlert />
      
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-serif font-bold text-3xl text-foreground capitalize">{t('products')} & Inventory</h1>
          <p className="text-muted-foreground mt-2">
            Manage your product catalog, monitor stock levels, and track movements
          </p>
        </div>
        <Button 
          onClick={() => setIsAuditOpen(true)}
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold cursor-pointer h-11"
        >
          <ClipboardCheck className="w-5 h-5 mr-2" />
          Start Audit Mode
        </Button>
      </div>

      <StockAuditDialog 
        isOpen={isAuditOpen} 
        onClose={() => setIsAuditOpen(false)} 
      />

      <Tabs defaultValue={defaultTab} className="space-y-6">
        <TabsList className="bg-muted/50 p-1 h-auto flex-wrap justify-start">
          <TabsTrigger value="products" className="px-4 py-2 capitalize">{t('products')} Database</TabsTrigger>
          <TabsTrigger value="overview" className="px-4 py-2">Overview</TabsTrigger>
          <TabsTrigger value="batches" className="px-4 py-2">Batches & Expiry</TabsTrigger>
          <TabsTrigger value="movements" className="px-4 py-2">Stock Movements</TabsTrigger>
          <TabsTrigger value="adjustments" className="px-4 py-2">Adjustments</TabsTrigger>
        </TabsList>

        <TabsContent value="products">
          <MedicineDatabase />
        </TabsContent>

        <TabsContent value="overview">
          <StockOverview />
        </TabsContent>

        <TabsContent value="batches">
          <BatchTracking />
        </TabsContent>

        <TabsContent value="movements">
          <StockMovements />
        </TabsContent>

        <TabsContent value="adjustments">
          <StockAdjustments />
        </TabsContent>
      </Tabs>
    </div>
  )
}
