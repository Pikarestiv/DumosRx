"use client";

import { useState, useEffect } from "react";
import { getPurchaseOrders, receivePurchaseOrder, type PurchaseOrder } from "@/lib/db/local-database";
import { toast } from "sonner";
import { CreatePODialog } from "@/components/procurement/create-po-dialog";
import { ProcurementStats } from "./procurement-stats";
import { PurchaseOrderTable } from "./purchase-order-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SupplierManagement } from "@/components/inventory/supplier-management";

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

  const filteredOrders = purchaseOrders.filter(po => {
    const matchesSearch = po.vendor_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          po.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = activeTab === "all" || po.status === activeTab;
    return matchesSearch && matchesTab;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif font-bold text-3xl text-foreground">Procurement & Vendors</h1>
          <p className="text-muted-foreground">Manage vendor purchase orders and inventory replenishment</p>
        </div>
        <CreatePODialog onPOCreated={fetchPurchaseOrders} />
      </div>

      <Tabs defaultValue="orders" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="orders">Purchase Orders</TabsTrigger>
          <TabsTrigger value="vendors">Vendors Directory</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-6">
          <ProcurementStats purchaseOrders={purchaseOrders} />
          
          <PurchaseOrderTable 
            orders={filteredOrders}
            loading={loading}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onReceivePO={handleReceivePO}
          />
        </TabsContent>

        <TabsContent value="vendors">
          <SupplierManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
}
