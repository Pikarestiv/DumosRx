import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getPurchaseOrders,
  receivePurchaseOrder,
  updatePurchaseOrderStatus,
  deletePurchaseOrder,
  type PurchaseOrder,
  type ReceivedItem,
} from "@/lib/db/local-database";
import { genericFuzzySearch } from "@/lib/utils/search";
import { queryKeys } from "@/lib/query-keys";
import { useAuth, checkCanViewAllActivity } from "@/lib/context/auth-context";

/** All business logic for the Orders tab of Procurement Management. */
export function usePurchaseOrders() {
  const [searchQuery, setSearchQuery] = useState("");
  const [poTab, setPoTab] = useState("all");
  // Guards against a double-click/double-tap on "Confirm & Receive" firing
  // receivePurchaseOrder twice for the same order (which would duplicate the
  // stock batch and its movement); also drives the button's loading state.
  const [isReceivingPO, setIsReceivingPO] = useState(false);
  const { user } = useAuth();
  const viewerId = checkCanViewAllActivity(user?.role) ? undefined : user?.id;

  const {
    data: purchaseOrders = [],
    isLoading: loading,
    refetch,
  } = useQuery({
    // poTab isn't a query param: getPurchaseOrders() always fetches
    // everything and filtering happens client-side below, so it doesn't
    // belong in the key (the old effect refetched on every tab switch for
    // no reason, since the underlying data never changed).
    ...queryKeys.purchaseOrders.all(viewerId),
    queryFn: async () => {
      const { data } = await getPurchaseOrders(viewerId);
      return data as PurchaseOrder[];
    },
  });

  const fetchPurchaseOrders = async () => {
    await refetch();
  };

  const handleReceivePO = async (id: string, receivedItems: ReceivedItem[]) => {
    if (isReceivingPO) return;
    setIsReceivingPO(true);
    try {
      const status = await receivePurchaseOrder(id, receivedItems);
      toast.success(
        status === "partially_received"
          ? "Partial receipt recorded, the outstanding balance is still open."
          : "Order received and stock updated!",
      );
      void fetchPurchaseOrders();
    } catch (error) {
      console.error("Failed to receive PO:", error);
      toast.error("Error receiving order");
    } finally {
      setIsReceivingPO(false);
    }
  };

  const handleSendPO = async (id: string) => {
    try {
      await updatePurchaseOrderStatus(id, "sent");
      toast.success("Order marked as sent!");
      void fetchPurchaseOrders();
    } catch (error) {
      console.error("Failed to mark PO as sent:", error);
      toast.error("Error updating order status");
    }
  };

  const handleDeletePO = async (id: string) => {
    try {
      await deletePurchaseOrder(id);
      toast.success("Purchase order deleted successfully");
      void fetchPurchaseOrders();
    } catch (error) {
      console.error("Failed to delete PO:", error);
      toast.error("Error deleting purchase order");
    }
  };

  const preFilteredOrders = purchaseOrders.filter((po) => {
    if (poTab === "all") return true;
    if (poTab === "missing-expiry") {
      return (
        (po.status === "received" || po.status === "partially_received") &&
        po.has_missing_expiry
      );
    }
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
    isReceivingPO,
    handleSendPO,
    handleDeletePO,
  };
}
