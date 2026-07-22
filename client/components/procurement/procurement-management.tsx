"use client";

import { useState, useEffect } from "react";
import {
  getPurchaseOrders,
  receivePurchaseOrder,
  type PurchaseOrder,
} from "@/lib/db/local-database";
import { genericFuzzySearch } from "@/lib/utils/search";
import { toast } from "sonner";
import { CreatePODialog } from "@/components/procurement/create-po-dialog";
import { ProcurementStats } from "./procurement-stats";
import { PurchaseOrderTable } from "./purchase-order-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SupplierManagement } from "@/components/stock-batch/supplier-management";
import { RequestedProductsTab } from "./requested-products-tab";

export function ProcurementManagement() {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  useEffect(() => {
    fetchPurchaseOrders();
  }, [activeTab]);

  const fetchPurchaseOrders = async () => {
    setLoading(true);
    try {
      const { data } = await getPurchaseOrders(1, 100);
      setPurchaseOrders(data as PurchaseOrder[]);
    } catch (error) {
      console.error("Failed to fetch POs:", error);
      toast.error("Could not load purchase orders");
    } finally {
      setLoading(false);
    }
  };

  const handleReceivePO = async (id: string) => {
    try {
      await receivePurchaseOrder(id);
      toast.success("Order received and stock updated!");
      fetchPurchaseOrders();
    } catch (error) {
      console.error("Failed to receive PO:", error);
      toast.error("Error receiving order");
    }
  };

  const preFilteredOrders = purchaseOrders.filter((po) => {
    const matchesTab = activeTab === "all" || po.status === activeTab;
    return matchesTab;
  });

  const { results: filteredOrders, isFuzzyFallback } = genericFuzzySearch(
    searchQuery,
    preFilteredOrders,
    ["vendor_name", "id"],
  );

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center gap-3 mb-5">
        <div>
          <div className="text-[12px] text-muted-foreground font-medium mb-0.5">DumosRx · Awka Main Pharmacy</div>
          <div className="text-[22px] font-serif font-bold">Procurement</div>
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          <CreatePODialog onPOCreated={fetchPurchaseOrders} />
        </div>
      </div>

      <Tabs defaultValue="orders" className="flex flex-col flex-1 min-h-0">
        <TabsList className="w-full md:w-max inline-flex gap-1 bg-card border border-border rounded-[11px] p-1 h-auto mb-5">
          <TabsTrigger 
            value="orders" 
            className="px-5 py-2 rounded-lg text-[13px] font-semibold cursor-pointer data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:text-muted-foreground data-[state=inactive]:bg-transparent shadow-none"
          >
            Purchase Orders
          </TabsTrigger>
          <TabsTrigger 
            value="requests"
            className="px-5 py-2 rounded-lg text-[13px] font-semibold cursor-pointer data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:text-muted-foreground data-[state=inactive]:bg-transparent shadow-none"
          >
            Requested Products
          </TabsTrigger>
          <TabsTrigger 
            value="suppliers"
            className="px-5 py-2 rounded-lg text-[13px] font-semibold cursor-pointer data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:text-muted-foreground data-[state=inactive]:bg-transparent shadow-none"
          >
            Vendors
          </TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="flex flex-col flex-1 min-h-0 mt-0 border-0 p-0">
          <ProcurementStats purchaseOrders={purchaseOrders} />

          <PurchaseOrderTable
            orders={filteredOrders}
            loading={loading}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onReceivePO={handleReceivePO}
            isFuzzyFallback={isFuzzyFallback}
          />
        </TabsContent>

        <TabsContent value="suppliers" className="flex flex-col flex-1 min-h-0 mt-0 border-0 p-0">
          <SupplierManagement />
        </TabsContent>

        <TabsContent value="requests" className="flex flex-col flex-1 min-h-0 mt-0 border-0 p-0">
          <RequestedProductsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
