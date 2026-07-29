import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getPurchaseOrders,
  receivePurchaseOrder,
  updatePurchaseOrderStatus,
  deletePurchaseOrder,
  type PurchaseOrder,
} from "@/lib/db/local-database";
import { genericFuzzySearch } from "@/lib/utils/search";
import { queryKeys } from "@/lib/query-keys";

/** All business logic for the Orders tab of Procurement Management. */
export function usePurchaseOrders() {
  const [searchQuery, setSearchQuery] = useState("");
  const [poTab, setPoTab] = useState("all");

  const {
    data: purchaseOrders = [],
    isLoading: loading,
    refetch,
  } = useQuery({
    // poTab isn't a query param — getPurchaseOrders() always fetches
    // everything and filtering happens client-side below — so it doesn't
    // belong in the key (the old effect refetched on every tab switch for
    // no reason, since the underlying data never changed).
    ...queryKeys.purchaseOrders.all(),
    queryFn: async () => {
      const { data } = await getPurchaseOrders();
      return data as PurchaseOrder[];
    },
  });

  const fetchPurchaseOrders = async () => {
    await refetch();
  };

  const handleReceivePO = async (id: string, receivedItems: any[]) => {
    try {
      await receivePurchaseOrder(id, receivedItems);
      toast.success("Order received and stock updated!");
      fetchPurchaseOrders();
    } catch (error) {
      console.error("Failed to receive PO:", error);
      toast.error("Error receiving order");
    }
  };

  const handleSendPO = async (id: string) => {
    try {
      await updatePurchaseOrderStatus(id, "sent");
      toast.success("Order marked as sent!");
      fetchPurchaseOrders();
    } catch (error) {
      console.error("Failed to mark PO as sent:", error);
      toast.error("Error updating order status");
    }
  };

  const handleDeletePO = async (id: string) => {
    try {
      await deletePurchaseOrder(id);
      toast.success("Purchase order deleted successfully");
      fetchPurchaseOrders();
    } catch (error) {
      console.error("Failed to delete PO:", error);
      toast.error("Error deleting purchase order");
    }
  };

  const preFilteredOrders = purchaseOrders.filter((po) => {
    if (poTab === "all") return true;
    if (poTab === "missing-expiry") return po.status === "received" && po.has_missing_expiry;
    return po.status === poTab;
  });

  const { results: filteredOrders, isFuzzyFallback } = genericFuzzySearch(
    searchQuery,
    preFilteredOrders,
    ["vendor_name", "id"],
  );

  return {
    purchaseOrders,
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
  };
}
