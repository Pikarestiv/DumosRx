"use client"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { StockOverview } from "./stock-overview"
import { StockMovements } from "./stock-movements"
import { PurchaseOrders } from "./purchase-orders"
import { SupplierManagement } from "./supplier-management"
import { StockAdjustments } from "./stock-adjustments"
import { BatchTracking } from "./batch-tracking"
import { Button } from "@/components/ui/button"
import { ClipboardCheck } from "lucide-react"
import { useState } from "react"
import { StockAuditDialog } from "./stock-audit-dialog"
import { ExpiringBatchesAlert } from "./expiring-batches-alert"

export function InventoryManagement() {
  const [isAuditOpen, setIsAuditOpen] = useState(false)

  return (
    <div className="space-y-6">
      <ExpiringBatchesAlert />
      
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-serif font-bold text-3xl text-foreground">Inventory Management</h1>
          <p className="text-muted-foreground mt-2">
            Monitor stock levels, track movements, and manage suppliers efficiently
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

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="batches">Batches & Expiry</TabsTrigger>
          <TabsTrigger value="movements">Stock Movements</TabsTrigger>
          <TabsTrigger value="purchases">Purchase Orders</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="adjustments">Adjustments</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <StockOverview />
        </TabsContent>

        <TabsContent value="batches">
          <BatchTracking />
        </TabsContent>

        <TabsContent value="movements">
          <StockMovements />
        </TabsContent>

        <TabsContent value="purchases">
          <PurchaseOrders />
        </TabsContent>

        <TabsContent value="suppliers">
          <SupplierManagement />
        </TabsContent>

        <TabsContent value="adjustments">
          <StockAdjustments />
        </TabsContent>
      </Tabs>
    </div>
  )
}
