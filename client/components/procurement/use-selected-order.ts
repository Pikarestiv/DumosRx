import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getPurchaseOrderById, type PurchaseOrder } from "@/lib/db/procurement";

// Manages which order is selected, keeps its full details in sync with the
// latest row data, and closes the panel if the selected order disappears
// from underneath it (e.g. deleted elsewhere).
export function useSelectedOrder(
  orders: PurchaseOrder[],
  initialSelectedId: string | null | undefined,
) {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(
    initialSelectedId ?? null,
  );
  const [panelView, setPanelView] = useState<"details" | "receive">(
    "details",
  );

  useEffect(() => {
    if (initialSelectedId) {
      setSelectedOrderId(initialSelectedId);
    }
  }, [initialSelectedId]);

  // Always land back on the details view when switching to a different order.
  useEffect(() => {
    setPanelView("details");
  }, [selectedOrderId]);

  const { data: fullSelectedPO, isLoading: isLoadingDetails } = useQuery({
    ...queryKeys.purchaseOrders.detail(selectedOrderId),
    queryFn: () => getPurchaseOrderById(selectedOrderId as string),
    enabled: !!selectedOrderId,
  });

  // Orders confirmed present in the list at some point, so a later
  // disappearance can be trusted as a real deletion rather than the list
  // just not having caught up yet (e.g. right after creating a new PO).
  const seenOrderIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const o of orders) seenOrderIdsRef.current.add(o.id);
  }, [orders]);

  useEffect(() => {
    // Close the panel if the selected order is removed from the list from
    // under it (e.g. deleted) rather than leaving it showing stale data.
    if (
      selectedOrderId &&
      orders.length > 0 &&
      !orders.find((o) => o.id === selectedOrderId) &&
      seenOrderIdsRef.current.has(selectedOrderId)
    ) {
      setSelectedOrderId(null);
    }
  }, [orders, selectedOrderId]);

  // Merge full details with the latest row data from the list (so status updates reflect immediately)
  const listOrder = orders.find((o) => o.id === selectedOrderId);
  const selectedPO =
    fullSelectedPO && listOrder
      ? { ...fullSelectedPO, ...listOrder }
      : fullSelectedPO || listOrder || null;

  return {
    selectedOrderId,
    setSelectedOrderId,
    panelView,
    setPanelView,
    selectedPO,
    isLoadingDetails,
  };
}
