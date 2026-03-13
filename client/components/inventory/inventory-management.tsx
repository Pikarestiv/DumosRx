"use client"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { StockOverview } from "./stock-overview"
import { StockMovements } from "./stock-movements"
import { PurchaseOrders } from "./purchase-orders"
import { SupplierManagement } from "./supplier-management"
import { StockAdjustments } from "./stock-adjustments"
import { BatchTracking } from "./batch-tracking"

export function InventoryManagement() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif font-bold text-3xl text-foreground">Inventory Management</h1>
        <p className="text-muted-foreground mt-2">
          Monitor stock levels, track movements, and manage suppliers efficiently
        </p>
      </div>

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
