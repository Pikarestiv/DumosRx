"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { formatDateSafe } from "@/lib/utils/date-utils";
import { CheckCircle2, Clock } from "lucide-react";
import type { SaleStockReconciliation } from "@/lib/types/sale";

interface TransactionStockReconciliationProps {
  reconciliation: SaleStockReconciliation;
  currencyCode?: string;
}

export function TransactionStockReconciliation({
  reconciliation,
}: TransactionStockReconciliationProps) {
  const { originallyOwed, settled, outstanding, status, settlements } = reconciliation;
  if (originallyOwed <= 0) return null;

  const isFullySettled = status === "settled";
  const isPartial = status === "partial";

  return (
    <div className="mt-4 rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/40 dark:bg-amber-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {isFullySettled ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
          )}
          <h4 className="text-sm font-semibold text-foreground">
            Stock Reconciliation
          </h4>
        </div>
        <Badge
          variant="secondary"
          className={
            isFullySettled
              ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-medium"
              : "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 font-medium"
          }
        >
          {isFullySettled
            ? "Stock owed · Settled"
            : isPartial
              ? "Stock owed · Partial"
              : "Stock owed · Open"}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        {isFullySettled
          ? `${originallyOwed} ${originallyOwed === 1 ? "unit" : "units"} in this sale were sold before stock receipt and have been fully settled.`
          : `${outstanding} ${outstanding === 1 ? "unit" : "units"} in this sale were sold without sufficient recorded stock and await delivery reconciliation.`}
      </p>

      <div className="grid grid-cols-3 gap-2 pt-1 text-center">
        <div className="p-2.5 rounded-xl bg-background border border-border/60">
          <div className="text-[11px] font-medium text-muted-foreground">Originally Owed</div>
          <div className="text-sm font-bold text-foreground mt-0.5">{originallyOwed}</div>
        </div>
        <div className="p-2.5 rounded-xl bg-background border border-border/60">
          <div className="text-[11px] font-medium text-muted-foreground">Settled</div>
          <div className="text-sm font-bold text-foreground mt-0.5">{settled}</div>
        </div>
        <div className="p-2.5 rounded-xl bg-background border border-border/60">
          <div className="text-[11px] font-medium text-muted-foreground">Outstanding</div>
          <div className={`text-sm font-bold mt-0.5 ${outstanding > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600"}`}>
            {outstanding}
          </div>
        </div>
      </div>

      {settlements.length > 0 && (
        <div className="pt-2 border-t border-amber-200/60 dark:border-amber-500/20 space-y-1.5">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Settlement Receipts
          </div>
          <div className="space-y-1.5">
            {settlements.map((s, idx) => (
              <div
                key={`${s.productId}-${s.movementDate}-${idx}`}
                className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-background/60 border border-border/40"
              >
                <div className="truncate mr-2">
                  <span className="font-medium text-foreground">
                    {s.productName || "Product"}
                  </span>
                  <span className="text-muted-foreground ml-1">
                    · {s.quantity} {s.quantity === 1 ? "unit" : "units"}
                  </span>
                  {s.purchaseOrderId && (
                    <span className="text-muted-foreground ml-1">
                      via {s.purchaseOrderId}
                    </span>
                  )}
                </div>
                <div className="text-muted-foreground shrink-0 text-[11px]">
                  {formatDateSafe(s.movementDate, "dd/MM/yyyy HH:mm", s.movementDate)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

