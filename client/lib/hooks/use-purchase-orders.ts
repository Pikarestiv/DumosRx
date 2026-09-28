import { useMemo, useState } from "react";
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
import { errorDescription } from "@/lib/utils/error-description";
import {
  costOverriddenProductIds,
  countSellingPriceOverrides,
} from "@/components/procurement/po-line-item-math";
import { getAverageCostPrice } from "@/lib/db/queries/products";
import { formatCurrency } from "@/lib/utils";
import { useStore } from "@/lib/context/store-context";
import { queryKeys } from "@/lib/query-keys";
import { useAuth } from "@/lib/context/auth-context";
import { useHasPermission } from "@/lib/hooks/use-permissions";

/** Product cost is a weighted average across every active batch, so a new
 * batch blends into it rather than replacing it - which reads as "the cost
 * I typed didn't save". This says what actually happened, mirroring the
 * selling-price-override confirmation right above its call site. */
async function notifyCostRecorded(
  receivedItems: ReceivedItem[],
  currencyCode?: string,
) {
  const productIds = costOverriddenProductIds(receivedItems);
  if (productIds.length === 0) return;

  const blendedAverage =
    productIds.length === 1 ? await getAverageCostPrice(productIds[0]) : null;

  toast.success(
    productIds.length === 1
      ? "Cost recorded for 1 item"
      : `Cost recorded for ${productIds.length} items`,
    {
      description:
        blendedAverage != null
          ? `Avg. Cost is now ${formatCurrency(blendedAverage, currencyCode)} - the new batch blends with the stock you already had, so it won't match what you typed.`
          : "Avg. Cost blends each new batch with the stock you already had, so the catalog figure won't match what you typed.",
    },
  );
}

/** All business logic for the Orders tab of Procurement Management. */
export function usePurchaseOrders() {
  const [searchQuery, setSearchQuery] = useState("");
  const [poTab, setPoTab] = useState("all");
  // Guards against a double-click/double-tap on "Confirm & Receive" firing
  // receivePurchaseOrder twice for the same order (which would duplicate the
  // stock batch and its movement); also drives the button's loading state.
  const [isReceivingPO, setIsReceivingPO] = useState(false);
  // Same guard as isReceivingPO, for the status writes that had none: a
  // double-tap on a laggy tablet fired "Mark as Sent"/"Delete" twice.
  const [isMutatingPO, setIsMutatingPO] = useState(false);
  const { user } = useAuth();
  const { storeProfile } = useStore();
  const viewerId = useHasPermission("view_activity_log") ? undefined : user?.id;

  const {
    data: purchaseOrders = [],
    isLoading: loading,
    isError: hasLoadError,
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

  /** Resolves true only when the write actually landed, so the caller can
   * keep the receiving panel (and its spinner) on screen until then and
   * leave it open on failure instead of navigating away from an order that
   * was never received. */
  const handleReceivePO = async (
    id: string,
    receivedItems: ReceivedItem[],
  ): Promise<boolean> => {
    if (isReceivingPO) return false;
    setIsReceivingPO(true);
    try {
      const status = await receivePurchaseOrder(id, receivedItems);
      toast.success(
        status === "partially_received"
          ? "Partial receipt recorded, the outstanding balance is still open."
          : "Order received and stock updated!",
      );
      // receivePurchaseOrder() writes products.selling_price synchronously
      // for any line with a real override, same as createAndReceivePurchaseOrder -
      // this is the other of the two paths that actually change the live
      // price immediately, so it gets the same confirmation toast.
      const priceOverrideCount = countSellingPriceOverrides(
        receivedItems.map((item) => ({ product_id: item.product_id ?? "", selling_price: item.selling_price })),
        receivedItems.map((item) => ({ id: item.product_id ?? "", selling_price: item.current_selling_price ?? null })),
      );
      if (priceOverrideCount > 0) {
        toast.success(
          priceOverrideCount === 1
            ? "Selling price updated for 1 item"
            : `Selling price updated for ${priceOverrideCount} items`,
        );
      }
      await notifyCostRecorded(receivedItems, storeProfile?.currency);
      void fetchPurchaseOrders();
      return true;
    } catch (error) {
      console.error("Failed to receive PO:", error);
      toast.error("Couldn't receive this order", {
        description: errorDescription(error),
      });
      return false;
    } finally {
      setIsReceivingPO(false);
    }
  };

  const handleSendPO = async (id: string) => {
    if (isMutatingPO) return;
    setIsMutatingPO(true);
    try {
      await updatePurchaseOrderStatus(id, "sent");
      toast.success("Order marked as sent!");
      void fetchPurchaseOrders();
    } catch (error) {
      console.error("Failed to mark PO as sent:", error);
      toast.error("Couldn't mark the order as sent", {
        description: errorDescription(error),
      });
    } finally {
      setIsMutatingPO(false);
    }
  };

  const handleDeletePO = async (id: string) => {
    if (isMutatingPO) return;
    setIsMutatingPO(true);
    try {
      await deletePurchaseOrder(id);
      toast.success("Purchase order deleted successfully");
      void fetchPurchaseOrders();
    } catch (error) {
      console.error("Failed to delete PO:", error);
      toast.error("Couldn't delete the purchase order", {
        description: errorDescription(error),
      });
    } finally {
      setIsMutatingPO(false);
    }
  };

  const { results: filteredOrders, isFuzzyFallback } = useMemo(() => {
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

    return genericFuzzySearch(searchQuery, preFilteredOrders, [
      "vendor_name",
      "id",
    ]);
  }, [purchaseOrders, poTab, searchQuery]);

  return {
    purchaseOrders,
    loading,
    hasLoadError,
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
    isMutatingPO,
  };
}
