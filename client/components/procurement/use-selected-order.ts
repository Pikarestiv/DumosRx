import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getPurchaseOrderById, type PurchaseOrder } from "@/lib/db/procurement";

// Manages which order is selected, keeps its full details in sync with the latest row data, and closes the panel if the se…
// Rationale: docs/CLIENT_COMMENTS.md#line-components-procurement-use-selected-order-ts-L6
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

  const [trackedInitialId, setTrackedInitialId] = useState(initialSelectedId);
  if (initialSelectedId !== trackedInitialId) {
    setTrackedInitialId(initialSelectedId);
    if (initialSelectedId) setSelectedOrderId(initialSelectedId);
  }

  const [panelOrderId, setPanelOrderId] = useState(selectedOrderId);
  if (panelOrderId !== selectedOrderId) {
    setPanelOrderId(selectedOrderId);
    setPanelView("details");
  }

  const { data: fullSelectedPO, isLoading: isLoadingDetails } = useQuery({
    ...queryKeys.purchaseOrders.detail(selectedOrderId),
    queryFn: () => getPurchaseOrderById(selectedOrderId as string),
    enabled: !!selectedOrderId,
  });

  // Orders confirmed present in the list at some point, so a later disappearance can be trusted as a real deletion rather th…
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-procurement-use-selected-order-ts-L37
  const [seenOrderIds, setSeenOrderIds] = useState<ReadonlySet<string>>(
    () => new Set(orders.map((o) => o.id)),
  );
  const unseenOrderIds = orders.map((o) => o.id).filter((id) => !seenOrderIds.has(id));
  if (unseenOrderIds.length > 0) {
    setSeenOrderIds(new Set([...seenOrderIds, ...unseenOrderIds]));
  }

  const selectedOrderWasRemoved =
    selectedOrderId !== null &&
    orders.length > 0 &&
    !orders.some((o) => o.id === selectedOrderId) &&
    seenOrderIds.has(selectedOrderId);
  if (selectedOrderWasRemoved) setSelectedOrderId(null);

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
