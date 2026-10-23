import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getProductsWithDetails } from "@/lib/db/queries/products";
import { sync } from "@/lib/db/sync-engine";
import { queryKeys } from "@/lib/query-keys";
import type { ProductWithDetails } from "@/lib/types/product";
import type { AuditItem } from "@/components/stock-batch/stock-audits";
import {
  mergeFreshLastAuditedAt,
  shouldRebuildAuditSheet,
} from "@/components/stock-batch/audit-derivations";
import { useStockAuditDraftStore } from "./use-stock-audit-draft";

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
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const items = useStockAuditDraftStore((state) => state.items);
  const setItems = useStockAuditDraftStore((state) => state.setItems);

  const { data: rawProducts, isLoading } = useQuery({
    ...queryKeys.products.withDetails(),
    queryFn: () => getProductsWithDetails(),
  });

  // Reconcile with the server on open, before counting.
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-stock-batch-stock-audits-tsx-L118
  useEffect(() => {
    void (async () => {
      setIsSyncing(true);
      try {
        await sync(true);
        void queryClient.invalidateQueries({
          queryKey: queryKeys.products.withDetails().queryKey,
        });
      } catch (error) {
        console.error("Pre-audit sync failed:", error);
        toast.warning(
          "Couldn't sync before starting: continuing with the data already on this device.",
        );
      } finally {
        setIsSyncing(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Counted Qty opens empty; the cost/price columns do not. Rebuild rules
  // and the deps: client/AGENTS.md.
  useEffect(() => {
    if (rawProducts && shouldRebuildAuditSheet(items)) {
      setItems(rawProducts.map(toAuditItem));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawProducts, items.length]);

  // Refresh "Last Counted" in place without touching counts in progress.
  // Rationale: docs/CLIENT_COMMENTS.md#stock-audits-last-audited-refresh
  useEffect(() => {
    if (!rawProducts || rawProducts.length === 0) return;
    setItems((prev) => mergeFreshLastAuditedAt(prev, rawProducts));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawProducts]);

  return { isLoading, isSyncing };
}
