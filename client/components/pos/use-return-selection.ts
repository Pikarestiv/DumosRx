"use client";

import { useState } from "react";
import type { SaleItemDetail, SaleServiceDetail } from "@/lib/types/sale";
import type { ReturnableItem, ReturnableService } from "@/lib/hooks/use-process-return-mutation";

export interface ItemSelection {
  selected: boolean;
  quantity: number;
  discardQuantity: number;
  discardReason: string;
}

export interface ServiceSelection {
  selected: boolean;
  quantity: number;
}

export function useReturnSelection(
  saleItems: SaleItemDetail[],
  saleServices: SaleServiceDetail[],
) {
  const [selectedItems, setSelectedItems] = useState<Map<string, ItemSelection>>(new Map());
  const [selectedServices, setSelectedServices] = useState<Map<string, ServiceSelection>>(new Map());

  const handleToggleItem = (itemId: string, maxQty: number) => {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      const current = next.get(itemId);
      next.set(itemId, {
        selected: !current?.selected,
        quantity: current?.quantity || maxQty,
        discardQuantity: current?.discardQuantity ?? 0,
        discardReason: current?.discardReason ?? "Damaged / Broken",
      });
      return next;
    });
  };

  const handleQtyChange = (itemId: string, qty: number, maxQty: number) => {
    const validQty = Math.min(Math.max(1, typeof qty === "number" && !isNaN(qty) ? qty : 1), maxQty);
    setSelectedItems((prev) => {
      const next = new Map(prev);
      const current = next.get(itemId);
      next.set(itemId, {
        selected: true,
        quantity: validQty,
        discardQuantity: Math.min(current?.discardQuantity ?? 0, validQty),
        discardReason: current?.discardReason ?? "Damaged / Broken",
      });
      return next;
    });
  };

  const handleDiscardQtyChange = (itemId: string, discardQty: number) => {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      const current = next.get(itemId);
      const returnQty = current?.quantity ?? 1;
      next.set(itemId, {
        selected: true,
        quantity: returnQty,
        discardQuantity: Math.min(Math.max(0, discardQty), returnQty),
        discardReason: current?.discardReason ?? "Damaged / Broken",
      });
      return next;
    });
  };

  const handleDiscardReasonChange = (itemId: string, discardReason: string) => {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      const current = next.get(itemId);
      if (!current) return prev;
      next.set(itemId, { ...current, discardReason });
      return next;
    });
  };

  const handleToggleService = (serviceId: string, maxQty: number) => {
    setSelectedServices((prev) => {
      const next = new Map(prev);
      const cur = next.get(serviceId);
      next.set(serviceId, { selected: !cur?.selected, quantity: cur?.quantity || maxQty });
      return next;
    });
  };

  const handleServiceQtyChange = (serviceId: string, qty: number, maxQty: number) => {
    const validQty = Math.min(Math.max(1, typeof qty === "number" && !isNaN(qty) ? qty : 1), maxQty);
    setSelectedServices((prev) => {
      const next = new Map(prev);
      next.set(serviceId, { selected: true, quantity: validQty });
      return next;
    });
  };

  const itemsToReturn: ReturnableItem[] = Array.from(selectedItems.entries())
    .filter(([_, val]) => val.selected)
    .map(([id, val]) => ({
      ...(saleItems?.find((si) => si.id === id) as SaleItemDetail),
      returnQuantity: val.quantity,
      discardQuantity: val.discardQuantity,
      discardReason: val.discardReason,
    }));

  const servicesToReturn: ReturnableService[] = Array.from(selectedServices.entries())
    .filter(([_, val]) => val.selected)
    .map(([id, val]) => {
      const s = saleServices.find((ss) => ss.id === id);
      return {
        id,
        saleServiceId: id,
        serviceId: s?.service_id || null,
        serviceName: s?.service_name || s?.name || "Service",
        quantity: s?.quantity || 1,
        returnQuantity: val.quantity,
        unitPrice: s?.unit_price || 0,
      };
    });

  return {
    selectedItems,
    selectedServices,
    handleToggleItem,
    handleQtyChange,
    handleDiscardQtyChange,
    handleDiscardReasonChange,
    handleToggleService,
    handleServiceQtyChange,
    itemsToReturn,
    servicesToReturn,
  };
}

