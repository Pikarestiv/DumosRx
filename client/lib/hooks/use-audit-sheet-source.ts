import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getProductsWithDetails } from "@/lib/db/queries/products";
import { queryKeys } from "@/lib/query-keys";
import type { ProductWithDetails } from "@/lib/types/product";
import type { AuditItem } from "@/components/stock-batch/stock-audits";
import {
  shouldRebuildAuditSheet,
  toAuditItem,
  reconcileAuditDraftWithCatalog,
} from "@/components/stock-batch/audit-derivations";
import { useStockAuditDraftStore } from "./use-stock-audit-draft";
import { usePreAuditSync } from "./use-pre-audit-sync";

export function useAuditSheetSource() {
  const items = useStockAuditDraftStore((state) => state.items);
  const setItems = useStockAuditDraftStore((state) => state.setItems);
  const draftRestored = useStockAuditDraftStore(
    (state) => state.activeStoreId === null || state.loadedStoreId === state.activeStoreId,
  );

  const { data: rawProducts, isLoading } = useQuery({
    ...queryKeys.products.withDetails(),
    queryFn: () => getProductsWithDetails(),
  });

  const presync = usePreAuditSync();
  const sheetMayBuild = presync.state === "ready" || presync.state === "stale";

  // Counted Qty opens empty; the cost/price columns do not. Rebuild rules
  // and the deps: client/AGENTS.md.
  useEffect(() => {
    if (sheetMayBuild && draftRestored && rawProducts && shouldRebuildAuditSheet(items)) {
      setItems(rawProducts.map(toAuditItem));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawProducts, items.length, draftRestored, sheetMayBuild]);

  // Reconcile draft against catalog: append new products, mark deleted products,
  // and keep uncounted stock/prices fresh (A-259).
  useEffect(() => {
    if (!sheetMayBuild || !draftRestored || !rawProducts || rawProducts.length === 0) return;
    setItems((prev) => reconcileAuditDraftWithCatalog(prev, rawProducts));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawProducts, draftRestored, sheetMayBuild]);

  return { isLoading: isLoading || !draftRestored, presync };
}
