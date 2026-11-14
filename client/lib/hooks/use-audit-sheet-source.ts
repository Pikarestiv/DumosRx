import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getProductsWithDetails } from "@/lib/db/queries/products";
import { queryKeys } from "@/lib/query-keys";
import type { ProductWithDetails } from "@/lib/types/product";
import type { AuditItem } from "@/components/stock-batch/stock-audits";
import {
  mergeFreshLastAuditedAt,
  shouldRebuildAuditSheet,
} from "@/components/stock-batch/audit-derivations";
import { useStockAuditDraftStore } from "./use-stock-audit-draft";
import { usePreAuditSync } from "./use-pre-audit-sync";

function toAuditItem(p: ProductWithDetails): AuditItem {
  return {
    id: p.id,
    name: p.name,
    sku: p.barcode || `SKU-${p.id.substring(0, 6)}`,
    category: p.category_name || "Uncategorized",
    systemQty: p.stock_quantity || 0,
    costPrice: p.cost_price ?? undefined,
    sellingPrice: p.selling_price ?? undefined,
    countedQty: undefined,
    countedCostPrice: p.cost_price ?? undefined,
    countedSellingPrice: p.selling_price ?? undefined,
    lastAuditedAt: p.last_audited_at ?? null,
  };
}

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

  // Refresh "Last Counted" in place without touching counts in progress.
  // Rationale: docs/CLIENT_COMMENTS.md#stock-audits-last-audited-refresh
  useEffect(() => {
    if (!draftRestored || !rawProducts || rawProducts.length === 0) return;
    setItems((prev) => mergeFreshLastAuditedAt(prev, rawProducts));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawProducts, draftRestored]);

  return { isLoading: isLoading || !draftRestored, presync };
}
