"use client";

import { Star, Receipt } from "lucide-react";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { CustomerTransaction } from "@/lib/hooks/use-customer-data";
import { EmptyState as SharedEmptyState } from "@/components/ui/empty-state";

const MAX_ITEMS_SHOWN = 2;

export function ItemsCell({ txn }: { txn: CustomerTransaction }) {
  if (txn.itemNames.length === 0) {
    return (
      <span className="text-muted-foreground">
        {txn.itemCount} item{txn.itemCount === 1 ? "" : "s"}
      </span>
    );
  }
  const shown = txn.itemNames.slice(0, MAX_ITEMS_SHOWN);
  const extra = txn.itemCount - shown.length;
  return (
    <span
      className="truncate block max-w-[280px]"
      title={txn.itemNames.join(", ")}
    >
      {shown.join(", ")}
      {extra > 0 && (
        <span className="text-muted-foreground"> +{extra} more</span>
      )}
    </span>
  );
}

export function ActivityEmptyState({
  loading,
  isAuditor,
}: {
  loading: boolean;
  isAuditor: boolean;
}) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground text-[13px] py-12">
        Loading activity...
      </div>
    );
  }
  return (
    <SharedEmptyState
      icon={Receipt}
      title="No transactions found"
      className="py-12"
      action={isAuditor ? undefined : { label: "Go to POS", href: "/pos" }}
    />
  );
}

export function ActivityMobileCard({
  txn,
  currencyCode,
}: {
  txn: CustomerTransaction;
  currencyCode: string;
}) {
  return (
    <div className="p-3 rounded-xl border bg-card space-y-2">
      <div className="flex justify-between items-start">
        <div>
          <div className="text-[13px] font-semibold">{txn.customerName}</div>
          <div className="text-[11px] text-muted-foreground">
            {txn.transactionNumber}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[13px] font-semibold">
            {formatCurrency(txn.amount, currencyCode)}
          </div>
          {txn.pointsEarned > 0 && (
            <div className="inline-flex items-center gap-1 text-[11px] text-amber-600">
              <Star className="w-3 h-3 fill-amber-600" />
              {txn.pointsEarned} pts
            </div>
          )}
        </div>
      </div>
      <div className="text-[11.5px] text-muted-foreground truncate">
        <ItemsCell txn={txn} />
      </div>
      <div className="text-[11px] text-muted-foreground">
        {formatDateTime(txn.date)}
      </div>
    </div>
  );
}
