"use client";

import { useRouter } from "next/navigation";
import { usePurchaseOrders } from "@/lib/hooks/use-purchase-orders";
import { PurchaseOrderTable } from "./purchase-order-table";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { SupplierManagement } from "@/components/stock-batch/supplier-management";
import { RequestedProductsTab } from "./requested-products-tab";
import { ProcurementTabNav } from "./procurement-tab-nav";
import { usePullToRefreshHandler } from "@/lib/context/pull-to-refresh-context";

// Radix only mounts the active TabsContent's children, so tying registration
// to this tab-scoped component (rather than the top of ProcurementManagement)
// ensures it's only active while the Orders tab actually is.
function OrdersPullToRefresh({ onRefresh }: { onRefresh: () => Promise<void> }) {
  usePullToRefreshHandler(onRefresh);
  return null;
}

interface ProcurementManagementProps {
  initialTab?: "orders" | "requests" | "suppliers";
}

export function ProcurementManagement({ initialTab = "orders" }: ProcurementManagementProps) {
  const router = useRouter();
  const {
    loading,
    searchQuery,
    setSearchQuery,
    poTab,
    setPoTab,
    filteredOrders,
    isFuzzyFallback,
    fetchPurchaseOrders,
    handleReceivePO,
    handleSendPO,
    handleDeletePO,
  } = usePurchaseOrders();

  const handleTabChange = (value: string) => {
    if (value === "orders") {
      router.push("/procurement");
    } else if (value === "suppliers") {
      router.push("/procurement/vendors");
    } else if (value === "requests") {
      router.push("/procurement/requests");
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Tabs value={initialTab} onValueChange={handleTabChange} className="flex flex-col flex-1 min-h-0 gap-4">
        <ProcurementTabNav />

        <TabsContent
          value="orders"
          className="flex flex-col flex-1 min-h-0 mt-0 border-0 p-0"
        >
          <OrdersPullToRefresh onRefresh={fetchPurchaseOrders} />

          <PurchaseOrderTable
            orders={filteredOrders}
            loading={loading}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            activeTab={poTab}
            onTabChange={setPoTab}
            onReceivePO={handleReceivePO}
            onSendPO={handleSendPO}
            onDeletePO={handleDeletePO}
            isFuzzyFallback={isFuzzyFallback}
          />
        </TabsContent>

        <TabsContent
          value="suppliers"
          className="flex flex-col flex-1 min-h-0 mt-0 border-0 p-0"
        >
          <SupplierManagement />
        </TabsContent>

        <TabsContent
          value="requests"
          className="flex flex-col flex-1 min-h-0 mt-0 border-0 p-0"
        >
          <RequestedProductsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
