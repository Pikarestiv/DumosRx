"use client";

import type React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Calendar,
  TrendingDown,
  CheckCircle2,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { getExpiringBatches } from "@/lib/db/queries/inventory";
import { useStore } from "@/lib/context/store-context";
import { useRouter } from "next/navigation";
import { queryKeys } from "@/lib/query-keys";
import { useUppercaseDisplayClass } from "@/lib/hooks/use-uppercase-display";
import { useStockVisibility } from "@/lib/hooks/use-stock-visibility";

interface AttentionItem {
  type: "expiring" | "critical" | "low";
  id: string;
  product_id: string;
  batch_id?: string;
  product_name: string;
  description: string;
  icon: React.ReactNode;
  iconClass: string;
  actionText: string;
  actionClass: string;
  onAction: () => void;
}

interface NeedsAttentionProps {
  stockData: StockItem[];
  onSelectProduct?: (
    productId: string,
    options?: { tab?: string; batchId?: string },
  ) => void;
}

interface StockItem {
  id: string;
  product_id: string;
  product_name: string;
  batch_number?: string;
  quantity: number;
  reorder_level?: number;
  status: "healthy" | "low" | "critical" | "overstock";
  expiry_date?: string;
  base_unit?: string;
}

function formatUnit(quantity: number, baseUnit?: string) {
  const unit = baseUnit || "unit";
  return quantity === 1 ? unit : `${unit}s`;
}

export function NeedsAttention({ stockData, onSelectProduct }: NeedsAttentionProps) {
  const router = useRouter();
  const { storeProfile } = useStore();
  const capsClass = useUppercaseDisplayClass();
  const { canSeeQuantities } = useStockVisibility();
  const expiryDays = storeProfile?.expiry_warning_days || 90;

  const { data: expiringBatchesData } = useQuery({
    ...queryKeys.stockBatches.expiring(expiryDays),
    queryFn: () => getExpiringBatches(expiryDays),
  });

  const expiringBatches = expiringBatchesData || [];

  const items: AttentionItem[] = [];

  // Add expiring batches
  expiringBatches.forEach((batch) => {
    const daysLeft = Math.ceil(
      (new Date(batch.expiry_date).getTime() - new Date().getTime()) /
        (1000 * 3600 * 24),
    );

    let expiryText = "";
    if (daysLeft < 0) {
      const d = new Date(batch.expiry_date);
      const formattedDate = `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;
      expiryText = `Expired on ${formattedDate}`;
    } else if (daysLeft === 0) {
      expiryText = `Expires today`;
    } else {
      expiryText = `Expires in ${daysLeft} days`;
    }

    const openBatchDetails = () => {
      if (onSelectProduct) {
        onSelectProduct(batch.product_id, { tab: "batches", batchId: batch.id });
        return;
      }
      router.push(
        `/inventory/catalog?productId=${batch.product_id}&batchId=${batch.id}&tab=batches`,
      );
    };

    items.push({
      type: "expiring",
      id: batch.id,
      product_id: batch.product_id,
      batch_id: batch.id,
      product_name: batch.name,
      description: canSeeQuantities
        ? `Batch ${batch.batch_number} · ${expiryText} · ${batch.stock_quantity} ${formatUnit(batch.stock_quantity, batch.base_unit)}`
        : `Batch ${batch.batch_number} · ${expiryText}`,
      icon: <Calendar className="w-4 h-4" />,
      iconClass: "bg-destructive/10 text-destructive",
      actionText: "View batch",
      actionClass: "text-destructive bg-destructive/10 hover:bg-destructive/20",
      onAction: openBatchDetails,
    });
  });

  // Add low/critical stock
  stockData.forEach((item) => {
    if (item.status === "critical" || item.status === "low") {
      const isCritical = item.status === "critical" || item.quantity === 0;
      items.push({
        type: item.status,
        id: item.id,
        product_id: item.product_id,
        product_name: item.product_name,
        description:
          item.quantity === 0
            ? `Out of stock · Missing out on sales`
            : `${canSeeQuantities ? `${item.quantity} ${formatUnit(item.quantity, item.base_unit)} left` : "Low stock"} · Reorder at ${item.reorder_level} ${formatUnit(item.reorder_level ?? 0, item.base_unit)}`,
        icon: isCritical ? (
          <AlertCircle className="w-4 h-4" />
        ) : (
          <TrendingDown className="w-4 h-4" />
        ),
        iconClass: isCritical
          ? "bg-destructive/10 text-destructive"
          : "bg-orange-500/10 text-orange-600 dark:text-orange-400",
        actionText: "Reorder",
        actionClass: isCritical
          ? "text-destructive bg-destructive/10 hover:bg-destructive/20"
          : "text-orange-600 dark:text-orange-400 bg-orange-500/10 hover:bg-orange-500/20",
        onAction: () => router.push(`/procurement`),
      });
    }
  });

  const shownCount = Math.min(items.length, 5);

  const header = (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <div className="text-[15px] font-semibold">Needs attention</div>
        {items.length > 5 && (
          <div className="text-[12.5px] text-muted-foreground">
            ({shownCount} of {items.length})
          </div>
        )}
      </div>
      <button
        type="button"
        className="text-[12.5px] text-primary font-semibold pointer-coarse:-my-3 pointer-coarse:py-3 cursor-pointer hover:underline rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
        onClick={() => router.push("/inventory/catalog?status=low_stock")}
      >
        View all
      </button>
    </div>
  );

  return (
    <div className="flex flex-col lg:h-full lg:min-h-0">
      {/* Mobile: header sits above the card */}
      <div className="lg:hidden mb-3">{header}</div>

      <div className="border-0 md:border md:border-border bg-transparent md:bg-card rounded-none md:rounded-2xl p-0 md:p-5 flex flex-col lg:flex-1 lg:min-h-0">
        {/* Desktop: header stays inside the card */}
        <div className="hidden lg:block mb-4 shrink-0">{header}</div>

        <div className="flex flex-col gap-2 md:gap-0 py-3 md:py-0 lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
          {items.length === 0 && (
            <EmptyState
              icon={CheckCircle2}
              title="All caught up"
              description="No items need immediate attention."
              className="py-4"
            />
          )}
          {!(items.length === 0) &&
            items.slice(0, 5).map((item, idx) => {
              const handleCardSelect = () => {
                if (onSelectProduct) {
                  onSelectProduct(item.product_id, {
                    tab: item.type === "expiring" ? "batches" : "details",
                    batchId: item.batch_id,
                  });
                  return;
                }
                router.push(`/inventory/catalog?productId=${item.product_id}`);
              };

              return (
                <div
                  key={item.id + idx}
                  role="button"
                  tabIndex={0}
                  onClick={handleCardSelect}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleCardSelect();
                    }
                  }}
                  className={`flex items-center gap-3 p-3 md:py-3 md:px-0 rounded-xl md:rounded-none border md:border-0 border-border bg-card md:bg-transparent cursor-pointer hover:bg-muted/40 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring ${idx !== items.length - 1 && idx !== 4 ? "md:border-b md:border-border" : ""}`}
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${item.iconClass}`}
                  >
                    {item.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-[13px] font-semibold truncate ${capsClass}`}
                    >
                      {item.product_name}
                    </div>
                    <div className="text-[11.5px] text-muted-foreground">
                      {item.description}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`text-[11.5px] font-semibold px-3 py-1.5 rounded-lg shrink-0 transition-colors ${item.actionClass}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      item.onAction();
                    }}
                  >
                    {item.actionText}
                  </button>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
