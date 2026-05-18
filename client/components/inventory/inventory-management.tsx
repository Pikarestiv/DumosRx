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
import { StockAuditDialog } from "./stock-audit-dialog"
import { ExpiringBatchesAlert } from "./expiring-batches-alert"
import { useStore } from "@/lib/context/store-context"

export function InventoryManagement() {
  const [isAuditOpen, setIsAuditOpen] = useState(false)
  const { t } = useStore()

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

      <Tabs defaultValue="products" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="products" className="capitalize">{t('products')} Database</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="batches">Batches & Expiry</TabsTrigger>
          <TabsTrigger value="movements">Stock Movements</TabsTrigger>
          <TabsTrigger value="adjustments">Adjustments</TabsTrigger>
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
