import { useCallback, useRef } from "react";
import { getProductStockQuantity } from "@/lib/db/queries/inventory";
import type { AuditItem } from "@/components/stock-batch/stock-audits";
import {
  applyCountBaseline,
  applyOptimisticCount,
  createCountSequencer,
} from "@/components/stock-batch/audit-derivations";
import { useStockAuditDraftStore } from "./use-stock-audit-draft";

export function useAuditCounting() {
  const setItems = useStockAuditDraftStore((state) => state.setItems);
  const counts = useRef(createCountSequencer());

  /** Records a count against live stock, not the figure the sheet opened
   * with; ticking with no value means "counted, and it matched". A-263. */
  const countRow = useCallback(
    async (id: string, countedQty?: number) => {
      const token = counts.current.begin(id);
      if (countedQty !== undefined) {
        setItems((prev) => applyOptimisticCount(prev, id, countedQty));
      }
      const live = await getProductStockQuantity(id);
      if (!counts.current.isCurrent(id, token)) return;
      setItems((prev) => applyCountBaseline(prev, id, countedQty, live));
    },
    [setItems],
  );

  const cancelPendingCounts = useCallback(
    (id?: string) => counts.current.cancel(id),
    [],
  );

  const updateLedgerItem = useCallback(
    (id: string, patch: Partial<AuditItem>) => {
      setItems((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, ...patch, counted: patch.counted ?? true } : i,
        ),
      );
    },
    [setItems],
  );

  return { countRow, cancelPendingCounts, updateLedgerItem };
}
