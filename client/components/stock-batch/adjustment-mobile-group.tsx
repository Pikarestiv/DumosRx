"use client";

import { format } from "date-fns";
import { ClipboardList, SlidersHorizontal } from "lucide-react";
import { AUDIT_REFERENCE_TYPE, type AdjustmentGroup } from "./adjustment-derivations";

interface Props {
  groupLabel: string;
  adjustments: AdjustmentGroup[];
}

/** Phone-width equivalent of the ledger's desktop grid, mirroring
 * StockMovementMobileGroup: a date heading followed by one card per
 * adjustment, carrying the same five facts the desktop columns show. */
export function AdjustmentMobileGroup({ groupLabel, adjustments }: Props) {
  return (
    <div className="mb-6">
      <div className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wide mb-2">
        {groupLabel}
      </div>
      <div className="flex flex-col gap-2">
        {adjustments.map((group) => {
          const isAudit = group.source === AUDIT_REFERENCE_TYPE;
          const Icon = isAudit ? ClipboardList : SlidersHorizontal;

          return (
            <div
              key={group.referenceId}
              data-testid={`adjustment-row-${group.referenceId}`}
              className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card shadow-sm"
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-muted/50">
                <Icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold text-foreground truncate">
                  {group.referenceId}
                </div>
                <div className="text-[12px] text-muted-foreground truncate mt-0.5">
                  {isAudit ? "Cycle count" : "Quick adjustment"} · {group.reason || "—"} ·{" "}
                  {group.itemCount} {group.itemCount === 1 ? "item" : "items"}
                </div>
                <div className="text-[11.5px] text-muted-foreground/70 truncate">
                  {group.date ? format(new Date(group.date), "HH:mm") : "—"}
                  {group.note ? ` · ${group.note}` : ""}
                </div>
              </div>
              <div
                className={`text-[15px] font-bold shrink-0 ${
                  group.netQuantity < 0 ? "text-destructive" : "text-emerald-600"
                }`}
              >
                {group.netQuantity > 0 ? `+${group.netQuantity}` : group.netQuantity}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
