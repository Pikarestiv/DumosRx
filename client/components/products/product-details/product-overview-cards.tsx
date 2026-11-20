"use client";

import { ChevronRight, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { averageCostTerms, lastReceivedBatch } from "@/lib/utils/batch-cost-breakdown";
import { formatDateSafe, formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import type { Product } from "../types";
import type { StockBatch } from "@/lib/types/stock-batch";

interface ProductOverviewCardsProps {
  product: Product;
  batches: StockBatch[];
  creator?: { name?: string; created_at?: string } | null;
  formatPrice: (amount: number) => string;
  onOpenCostBreakdown: () => void;
  onEditProduct: (product: Product) => void;
  canViewCost?: boolean;
}

const CARD =
  "bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4";

export function ProductOverviewCards({
  product,
  batches,
  creator,
  formatPrice,
  onOpenCostBreakdown,
  onEditProduct,
  canViewCost = true,
}: ProductOverviewCardsProps) {
  const router = useRouter();

  const { average } = averageCostTerms(batches);
  const avgCost = canViewCost ? (average ?? product.costPrice ?? 0) : 0;
  const last = lastReceivedBatch(batches);
  const lastCost = canViewCost ? (last?.cost_price ?? product.costPrice ?? 0) : 0;
  const sellingPrice = product.sellingPrice ?? 0;

  const profitAtAvg = Math.max(0, sellingPrice - avgCost);
  const marginAtAvg =
    sellingPrice > 0 ? (((sellingPrice - avgCost) / sellingPrice) * 100).toFixed(1) : "0.0";
  const markupAtAvg =
    avgCost > 0 ? (((sellingPrice - avgCost) / avgCost) * 100).toFixed(1) : "0.0";

  const profitAtLast = Math.max(0, sellingPrice - lastCost);
  const marginAtLast =
    sellingPrice > 0 ? (((sellingPrice - lastCost) / sellingPrice) * 100).toFixed(1) : "0.0";

  const activeBatches = batches.filter((b) => b.quantity > 0);
  const earliestExpiryBatch = [...activeBatches]
    .filter((b) => Boolean(b.expiry_date?.trim()))
    .sort((a, b) => (a.expiry_date ?? "").localeCompare(b.expiry_date ?? ""))[0];
  const nextExpiry = earliestExpiryBatch?.expiry_date || product.expiryDate;

  return (
    <div className="flex flex-col gap-4">
      {/* 2x2 KPI Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className={CARD}>
          <div className="text-xs text-muted-foreground font-medium">In stock</div>
          <div className="text-xl font-bold text-foreground mt-1 tracking-tight">
            {product.stockQuantity} {product.stockQuantity === 1 ? "unit" : "units"}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Reorder at {product.reorderLevel}
          </div>
        </div>

        <div className={CARD}>
          <div className="text-xs text-muted-foreground font-medium">Selling price</div>
          <div className="text-xl font-bold text-foreground mt-1 tracking-tight">
            {formatPrice(sellingPrice)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">per unit</div>
        </div>

        <div className={CARD}>
          <div className="text-xs text-muted-foreground font-medium">Avg cost</div>
          <div className="text-xl font-bold text-foreground mt-1 tracking-tight">
            {canViewCost ? formatPrice(avgCost) : "—"}
          </div>
          {canViewCost && (
            <button
              type="button"
              onClick={onOpenCostBreakdown}
              className="text-[11px] text-primary font-medium mt-1 flex items-center hover:underline group"
            >
              <span>From {activeBatches.length} {activeBatches.length === 1 ? "batch" : "batches"}</span>
              <ChevronRight className="w-3 h-3 ml-0.5 transition-transform group-hover:translate-x-0.5" />
            </button>
          )}
        </div>

        <div className={CARD}>
          <div className="text-xs text-muted-foreground font-medium">Margin</div>
          <div className="text-xl font-bold text-foreground mt-1 tracking-tight">
            {canViewCost ? `${marginAtAvg}%` : "—"}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {canViewCost ? `${formatPrice(profitAtAvg)} profit per unit` : "—"}
          </div>
        </div>
      </div>

      {/* Pricing Card */}
      {canViewCost && (
        <div className={CARD}>
          <div className="flex items-center justify-between pb-2 border-b border-border/50">
            <h4 className="font-bold text-sm text-foreground">Pricing</h4>
            <button
              type="button"
              onClick={() => onEditProduct(product)}
              className="text-xs text-primary font-semibold hover:underline"
            >
              Change price
            </button>
          </div>

          <div className="mt-3 space-y-2.5 text-xs">
            <div className="grid grid-cols-[1.5fr_1fr_1fr] text-[11px] font-semibold text-muted-foreground uppercase">
              <span>Based on</span>
              <span className="text-right">Profit/unit</span>
              <span className="text-right">Margin</span>
            </div>

            <div className="grid grid-cols-[1.5fr_1fr_1fr] items-center pt-1 border-t border-border/30">
              <div>
                <div className="font-semibold text-foreground">
                  Avg cost {formatPrice(avgCost)}
                </div>
                <div className="text-[11px] text-muted-foreground">Stock on the shelf</div>
              </div>
              <div className="text-right font-medium text-foreground">
                {formatPrice(profitAtAvg)}
              </div>
              <div className="text-right font-bold text-foreground">
                {marginAtAvg}%
              </div>
            </div>

            <div className="grid grid-cols-[1.5fr_1fr_1fr] items-center pt-2 border-t border-border/30">
              <div>
                <div className="font-semibold text-foreground">
                  Last cost {formatPrice(lastCost)}
                </div>
                <div className="text-[11px] text-muted-foreground">What restocking costs</div>
              </div>
              <div className="text-right font-medium text-foreground">
                {formatPrice(profitAtLast)}
              </div>
              <div className="text-right font-bold text-foreground">
                {marginAtLast}%
              </div>
            </div>

            <div className="pt-2 text-[11px] text-muted-foreground">
              Markup on avg cost: {markupAtAvg}%
            </div>
          </div>
        </div>
      )}

      {/* Stock & Expiry Card */}
      <div className={CARD}>
        <h4 className="font-bold text-sm text-foreground mb-3">Stock & expiry</h4>
        <div className="space-y-3 text-xs divide-y divide-border/40">
          <div className="flex items-center justify-between pt-1 first:pt-0">
            <span className="text-muted-foreground">Next expiry</span>
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">
                {nextExpiry ? formatDateToDDMMYYYY(nextExpiry) : "Not set"}
              </span>
              <button
                type="button"
                onClick={() => onEditProduct(product)}
                className="text-primary font-semibold hover:underline"
              >
                {nextExpiry ? "Edit" : "Add"}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3">
            <span className="text-muted-foreground">Last counted</span>
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">Never</span>
              <button
                type="button"
                onClick={() => router.push(`/inventory/batches?action=adjust&productId=${product.id}`)}
                className="text-primary font-semibold hover:underline"
              >
                Count now
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Product Details Card */}
      <div className={CARD}>
        <h4 className="font-bold text-sm text-foreground mb-3">Product details</h4>
        <div className="space-y-3 text-xs divide-y divide-border/40">
          <div className="flex items-center justify-between pt-1 first:pt-0">
            <span className="text-muted-foreground">Category</span>
            <span className="font-medium text-foreground">
              {product.category || "General"}
            </span>
          </div>

          <div className="flex items-center justify-between pt-3">
            <span className="text-muted-foreground">Barcode</span>
            <span className="font-mono font-medium text-foreground">
              {product.barcode || "Not set"}
            </span>
          </div>

          <div className="pt-3">
            <button
              type="button"
              onClick={() => onEditProduct(product)}
              className="flex items-start gap-2 text-left text-primary hover:underline group"
            >
              <Plus className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold text-xs">
                  {product.genericName || product.dosageForm ? "Edit details" : "Add details"}
                </span>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                  Generic name, strength, dosage form, NAFDAC no., manufacturer
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Footer attribution */}
      <div className="text-[11px] text-muted-foreground/75 px-1 pb-2">
        Created by {creator?.name || "System"} ·{" "}
        {formatDateSafe(creator?.created_at ?? "", "dd/MM/yyyy, HH:mm", "Unknown date")}
      </div>
    </div>
  );
}
