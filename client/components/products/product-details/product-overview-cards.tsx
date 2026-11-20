"use client";

import type { ReactNode } from "react";
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

const CARD_FLUSH =
  "bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden";
const CARD = `${CARD_FLUSH} p-4`;

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

      {canViewCost && (
        <Section
          title="Pricing"
          action={
            <button
              type="button"
              onClick={() => onEditProduct(product)}
              className="text-xs text-primary font-semibold hover:underline"
            >
              Change price
            </button>
          }
          footer={`Markup on avg cost: ${markupAtAvg}%`}
        >
          <div className={`${PRICING_GRID} px-4 py-2.5 text-[11px] font-medium text-muted-foreground`}>
            <span>Based on</span>
            <span className="text-right">Profit/unit</span>
            <span className="text-right">Margin</span>
          </div>
          <PricingRow
            label={`Avg cost ${formatPrice(avgCost)}`}
            hint="Stock on the shelf"
            profit={formatPrice(profitAtAvg)}
            margin={marginAtAvg}
          />
          <PricingRow
            label={`Last cost ${formatPrice(lastCost)}`}
            hint="What restocking costs"
            profit={formatPrice(profitAtLast)}
            margin={marginAtLast}
          />
        </Section>
      )}

      <Section title="Stock & expiry">
        <ValueRow label="Next expiry">
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
        </ValueRow>
        <ValueRow label="Last counted">
          <span className="font-medium text-foreground">
            {product.lastAuditedAt
              ? formatDateSafe(product.lastAuditedAt, "dd/MM/yyyy HH:mm", "Never")
              : "Never"}
          </span>
          <button
            type="button"
            onClick={() => router.push(`/inventory/batches?action=adjust&productId=${product.id}`)}
            className="text-primary font-semibold hover:underline"
          >
            Count now
          </button>
        </ValueRow>
      </Section>

      <Section title="Product details">
        <ValueRow label="Category">
          <span className="font-medium text-foreground">{product.category || "General"}</span>
        </ValueRow>
        <ValueRow label="Barcode">
          <span className="font-mono font-medium text-foreground">{product.barcode || "Not set"}</span>
        </ValueRow>
        <button
          type="button"
          onClick={() => onEditProduct(product)}
          className="flex w-full flex-col gap-0.5 px-4 py-3 text-left hover:bg-muted/30"
        >
          <span className="flex items-center gap-2 text-primary">
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span className="font-semibold text-xs leading-none">
              {product.genericName || product.dosageForm ? "Edit details" : "Add details"}
            </span>
          </span>
          <span className="pl-[22px] text-[11px] text-muted-foreground leading-snug">
            Generic name, strength, dosage form, NAFDAC no., manufacturer
          </span>
        </button>
      </Section>

      <div className="text-[11px] text-muted-foreground/75 px-1 pb-2">
        Created by {creator?.name || "System"} ·{" "}
        {formatDateSafe(creator?.created_at ?? "", "dd/MM/yyyy, HH:mm", "Unknown date")}
      </div>
    </div>
  );
}

const PRICING_GRID = "grid grid-cols-[1.5fr_1fr_1fr] items-center";

function Section({
  title,
  action,
  footer,
  children,
}: {
  title: string;
  action?: ReactNode;
  footer?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <h4 className="font-bold text-sm text-foreground">{title}</h4>
        {action}
      </div>
      <div className={`${CARD_FLUSH} divide-y divide-slate-200 dark:divide-slate-800`}>{children}</div>
      {footer && <p className="px-1 text-[11px] text-muted-foreground">{footer}</p>}
    </section>
  );
}

function ValueRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function PricingRow({
  label,
  hint,
  profit,
  margin,
}: {
  label: string;
  hint: string;
  profit: string;
  margin: string;
}) {
  return (
    <div className={`${PRICING_GRID} px-4 py-3 text-xs`}>
      <div>
        <div className="font-semibold text-foreground">{label}</div>
        <div className="text-[11px] text-muted-foreground">{hint}</div>
      </div>
      <div className="text-right font-semibold text-foreground">{profit}</div>
      <div className="text-right font-semibold text-foreground">{margin}%</div>
    </div>
  );
}
