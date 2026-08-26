"use client";

import { useState, useEffect } from "react";
import { AuditLedgerStep } from "./audit-ledger-step";
import { AuditReviewStep } from "./audit-review-step";
import { ChevronLeft, CheckCircle2, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getProductsWithDetails } from "@/lib/db/queries/products";
import { submitStockAudit } from "@/lib/db/queries/inventory";
import { sync } from "@/lib/db/sync-engine";
import { genericFuzzySearch } from "@/lib/utils/search";
import { queryKeys } from "@/lib/query-keys";
import { useAuth } from "@/lib/context/auth-context";
import { toast } from "sonner";
import type { ProductWithDetails } from "@/lib/types/product";

type AuditStep = "ledger" | "review" | "done";
const ALL_CATEGORIES = "__all__";

export interface AuditItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  systemQty: number;
  countedQty?: number;
  costPrice?: number;
  countedCostPrice?: number;
  sellingPrice?: number;
  countedSellingPrice?: number;
  reason?: string;
}

export function StockAudits({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<AuditStep>("ledger");
  const [selectedCategory, setSelectedCategory] =
    useState<string>(ALL_CATEGORIES);
  const [search, setSearch] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [submittedSummary, setSubmittedSummary] = useState<{
    counted: number;
    adjusted: number;
  } | null>(null);

  // Data fetching
  const { data: rawProducts, isLoading } = useQuery({
    ...queryKeys.products.withDetails(),
    queryFn: () => getProductsWithDetails(),
  });

  const [items, setItems] = useState<AuditItem[]>([]);

  // Reconcile against the latest server state as soon as the count screen
  // opens, otherwise a stale local snapshot could make an already-corrected
  // discrepancy look like a fresh one, or hide a real one that happened
  // elsewhere since this device last synced.
  useEffect(() => {
    (async () => {
      setIsSyncing(true);
      try {
        await sync(true);
        queryClient.invalidateQueries({
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
    // Only ever run once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Every row is editable from the moment it loads, pre-filled with the
  // system's current values, so counted/adjusted stats only reflect rows
  // someone actually changed. Only runs on the first load: a later
  // background refetch (e.g. after the sync above) must not clobber counts
  // already in progress.
  useEffect(() => {
    if (rawProducts && items.length === 0) {
      const formatted: AuditItem[] = rawProducts.map(
        (p: ProductWithDetails) => ({
          id: p.id,
          name: p.name,
          sku: p.barcode || `SKU-${p.id.substring(0, 6)}`,
          category: p.category_name || "Uncategorized",
          systemQty: p.stock_quantity || 0,
          costPrice: p.cost_price ?? undefined,
          sellingPrice: p.selling_price ?? undefined,
          countedQty: p.stock_quantity || 0,
          countedCostPrice: p.cost_price ?? undefined,
          countedSellingPrice: p.selling_price ?? undefined,
        }),
      );
      setItems(formatted);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawProducts]);

  const categories = Array.from(new Set(items.map((i) => i.category)))
    .map((cat) => ({
      id: cat,
      label: cat,
      count: items.filter((i) => i.category === cat).length,
    }))
    .sort((a, b) => b.count - a.count);

  const categoryItems =
    selectedCategory === ALL_CATEGORIES
      ? items
      : items.filter((i) => i.category === selectedCategory);

  const { results: filteredList } = genericFuzzySearch(search, categoryItems, [
    "name",
    "sku",
  ]);

  const countedItems = items.filter((i) => i.countedQty !== undefined);
  const adjustedItems = countedItems.filter(
    (i) =>
      i.countedQty !== i.systemQty ||
      (i.countedCostPrice !== undefined &&
        i.countedCostPrice !== i.costPrice) ||
      (i.countedSellingPrice !== undefined &&
        i.countedSellingPrice !== i.sellingPrice),
  );

  const updateLedgerItem = (id: string, patch: Partial<AuditItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  const submitAudit = async () => {
    setIsSubmitting(true);
    try {
      await submitStockAudit(
        adjustedItems.map((i) => ({
          productId: i.id,
          systemQty: i.systemQty,
          countedQty: i.countedQty as number,
          systemCostPrice: i.costPrice,
          countedCostPrice: i.countedCostPrice ?? i.costPrice,
          systemSellingPrice: i.sellingPrice,
          countedSellingPrice: i.countedSellingPrice ?? i.sellingPrice,
          reason: i.reason,
        })),
        user?.id || null,
      );
      setSubmittedSummary({
        counted: countedItems.length,
        adjusted: adjustedItems.length,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.products.withDetails().queryKey,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.stockAudits.all().queryKey,
      });
      setStep("done");
    } catch (error) {
      console.error("Failed to submit stock audit:", error);
      toast.error("Failed to save the cycle count. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background w-full h-full">
      {/* Header, top padding clears the status bar / Tauri title bar */}
      <div
        className="flex items-center gap-3 px-4 md:px-6 pb-4 md:pb-5 border-b border-border bg-card"
        style={{ paddingTop: "calc(var(--tauri-top, 0px) + 1rem)" }}
      >
        <div
          className="w-8 h-8 md:w-[38px] md:h-[38px] rounded-[10px] bg-muted/30 flex items-center justify-center cursor-pointer text-muted-foreground shrink-0 hover:bg-muted hover:border hover:border-border transition-colors"
          onClick={() => {
            if (step === "review") setStep("ledger");
            else onClose();
          }}
        >
          <ChevronLeft className="w-5 h-5" />
        </div>
        <div>
          <div className="text-[14px] md:text-[15px] font-semibold">
            Cycle Count
          </div>
          <div className="text-[11px] md:text-[11.5px] text-muted-foreground">
            {step === "ledger" && "Count items"}
            {step === "review" && "Review"}
            {step === "done" && "Finished"}
          </div>
        </div>
        <div className="ml-auto hidden md:flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-200 rounded-full px-3 py-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
          <span className="text-[11.5px] font-semibold text-emerald-700">
            Saved locally · syncs when online
          </span>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto p-4 md:p-8 md:pt-4 flex justify-center"
        style={{
          paddingBottom:
            "calc(var(--tauri-bottom, env(safe-area-inset-bottom, 0px)) + 1rem)",
        }}
      >
        <div
          className={
            step === "ledger" ? "w-full max-w-[1280px]" : "w-full max-w-[560px]"
          }
        >
          {/* LEDGER */}
          {step === "ledger" && (
            <AuditLedgerStep
              items={filteredList}
              totalItems={items.length}
              isLoading={isLoading}
              isSyncing={isSyncing}
              onUpdateItem={updateLedgerItem}
              categories={categories}
              selectedCategory={selectedCategory}
              setSelectedCategory={setSelectedCategory}
              search={search}
              setSearch={setSearch}
            />
          )}

          {/* REVIEW */}
          {step === "review" && (
            <AuditReviewStep
              countedItems={countedItems}
              adjustedItems={adjustedItems}
            />
          )}

          {/* DONE */}
          {step === "done" && (
            <div className="text-center py-10 animate-in zoom-in-95 duration-500">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-700 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="text-[18px] font-semibold mb-1.5">
                Audit submitted
              </div>
              <div className="text-[13px] text-muted-foreground mb-6">
                {submittedSummary?.counted ?? countedItems.length} items counted
                · {submittedSummary?.adjusted ?? adjustedItems.length} adjusted
              </div>
            </div>
          )}
        </div>
      </div>

      {/* FIXED FOOTER */}
      <div className="border-t border-border bg-background p-4 md:px-8 md:py-5 flex justify-center shrink-0">
        <div
          className={
            step === "ledger" ? "w-full max-w-[1280px]" : "w-full max-w-[560px]"
          }
        >
          {step === "ledger" && (
            <button
              className="w-full bg-primary text-white border-0 py-3.5 rounded-xl text-[14px] font-bold cursor-pointer hover:bg-primary/90 transition-colors"
              onClick={() => setStep("review")}
            >
              Review &amp; submit
            </button>
          )}

          {step === "review" && (
            <button
              className="w-full bg-primary text-white border-0 py-3.5 rounded-xl text-[14px] font-bold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              disabled={isSubmitting}
              onClick={submitAudit}
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSubmitting ? "Submitting..." : "Submit audit"}
            </button>
          )}

          {step === "done" && (
            <button
              className="w-full bg-primary text-white border-0 py-3.5 rounded-xl text-[14px] font-bold cursor-pointer hover:bg-primary/90 transition-colors"
              onClick={onClose}
            >
              Close Audit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
