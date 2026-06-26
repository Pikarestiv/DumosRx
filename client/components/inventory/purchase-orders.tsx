"use client";

import { useState } from "react";
import { toast } from "sonner";

import { usePurchaseOrders } from "@/lib/hooks/use-purchase-orders";
import { PurchaseOrderLoading } from "./purchase-orders/purchase-order-loading";
import { PurchaseOrderMetrics } from "./purchase-orders/purchase-order-metrics";
import { PurchaseOrderFilters } from "./purchase-orders/purchase-order-filters";
import { PurchaseOrderTable } from "./purchase-orders/purchase-order-table";

export function PurchaseOrders() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { orders, loading, totalOrderValue, pendingOrders, draftOrders } =
    usePurchaseOrders();

  const handleNewPurchaseOrder = () => {
    toast.info("New Purchase Order dialog coming soon!");
  };

  if (loading) {
    return <PurchaseOrderLoading />;
  }

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.supplier.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || order.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <PurchaseOrderMetrics
        totalOrders={orders.length}
        pendingOrders={pendingOrders}
        draftOrders={draftOrders}
        totalOrderValue={totalOrderValue}
      />

      <PurchaseOrderFilters
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        onNewPurchaseOrder={handleNewPurchaseOrder}
      />

      <PurchaseOrderTable orders={orders} filteredOrders={filteredOrders} />
    </div>
  );
}
