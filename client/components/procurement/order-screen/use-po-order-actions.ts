"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getPurchaseOrderById, updatePurchaseOrderStatus, type PurchaseOrder } from "@/lib/db/procurement";
import { receivePurchaseOrder, type ReceivedItem } from "@/lib/db/procurement-receiving";
import { errorDescription } from "@/lib/utils/error-description";
import { useDisplayName } from "@/lib/hooks/use-uppercase-display";
import { SELF_PURCHASE_VENDOR_ID } from "../po-details-fields";
import { quantityMissingMessage } from "../po-line-item-math";
import { usePoPdfDownload } from "../use-po-pdf-download";
import { scheduleDraftDelete } from "./schedule-draft-delete";
import type { usePoOrderEditor } from "./use-po-order-editor";

type Editor = ReturnType<typeof usePoOrderEditor>;

const RECEIVE_TOASTS = new Map<string, string>([
  ["received", "Order received and stock updated!"],
  ["partially_received", "Partial receipt recorded, the outstanding balance is still open."],
]);

export function usePoOrderActions(editor: Editor) {
  const router = useRouter();
  const displayName = useDisplayName();
  const pdf = usePoPdfDownload(null);
  const [receivePo, setReceivePo] = useState<PurchaseOrder | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isLeaveUnsavedOpen, setIsLeaveUnsavedOpen] = useState(false);
  const { orderId, autosave } = editor;
  const openList = () => router.push(`/procurement?selected=${orderId}`);

  const savedOrder = async (): Promise<PurchaseOrder | null> => {
    await autosave.scheduler.flush();
    if (autosave.scheduler.lastError()) {
      toast.error("This order isn't saved yet", { description: "Fix the save problem above first." });
      return null;
    }
    return getPurchaseOrderById(orderId);
  };

  const requireItems = () => {
    if (editor.draftRef.current.items.length > 0) return true;
    toast.error("Add at least one item to the order");
    return false;
  };

  const run = async (task: () => Promise<void>) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await task();
    } catch (error) {
      console.error("Purchase order action failed", error);
      toast.error("Something went wrong with this order", { description: errorDescription(error) });
    } finally {
      setIsBusy(false);
    }
  };

  return {
    isBusy,
    isGeneratingPdf: pdf.isGenerating,
    receivePo,
    closeReceive: () => setReceivePo(null),
    isLeaveUnsavedOpen,
    stay: () => setIsLeaveUnsavedOpen(false),
    leaveAnyway: () => {
      setIsLeaveUnsavedOpen(false);
      router.push("/procurement");
    },
    back: () => run(async () => {
      await autosave.scheduler.flush();
      if (autosave.scheduler.lastError()) {
        setIsLeaveUnsavedOpen(true);
        return;
      }
      await autosave.leave();
      router.push("/procurement");
    }),
    downloadPdf: () => run(async () => {
      if (!requireItems()) return;
      const po = await savedOrder();
      if (po) await pdf.download(po);
    }),
    prepareReceive: () => run(async () => {
      if (!requireItems()) return;
      const po = await savedOrder();
      if (po) setReceivePo(po);
    }),
    confirmReceive: (_id: string, items: ReceivedItem[]) => run(async () => {
      const status = await receivePurchaseOrder(orderId, items);
      setReceivePo(null);
      if (status === "already_received" || status === "not_found" || status === "not_receivable" || status === undefined) {
        toast.info("Nothing was received, the order is unchanged.");
        return;
      }
      toast.success(RECEIVE_TOASTS.get(status) ?? "Order received");
      openList();
    }),
    send: () => run(async () => {
      const current = editor.draftRef.current;
      if (current.supplierId === SELF_PURCHASE_VENDOR_ID) {
        toast.error("Choose the vendor this order is going to");
        return;
      }
      if (!requireItems()) return;
      const missing = quantityMissingMessage(current.items, displayName);
      if (missing) {
        toast.error(missing);
        return;
      }
      const po = await savedOrder();
      if (!po) return;
      await updatePurchaseOrderStatus(orderId, "sent");
      editor.setStatus("sent");
      toast.success("Marked as ordered");
      await pdf.share({ ...po, status: "sent" });
      openList();
    }),
    deleteDraft: () => run(async () => {
      await autosave.scheduler.flush();
      if (autosave.persistedRef.current) {
        scheduleDraftDelete(orderId, { onUndo: () => router.push(`/procurement/edit?id=${orderId}`) });
      }
      router.push("/procurement");
    }),
  };
}
