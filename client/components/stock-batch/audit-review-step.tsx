import React from "react";
import type { AuditItem } from "./stock-audits";

interface AuditReviewStepProps {
  countedItems: AuditItem[];
  adjustedItems: AuditItem[];
}

export function AuditReviewStep({
  countedItems,
  adjustedItems,
}: AuditReviewStepProps) {
  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="text-[17px] font-semibold mb-1.5">Review &amp; submit</div>
      <div className="text-[13px] text-muted-foreground mb-5">Check the adjustments below before submitting to the ledger.</div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-5">
        <div className="bg-card border border-border p-3 rounded-xl">
          <div className="text-[11px] text-muted-foreground font-semibold uppercase">Total Counted</div>
          <div className="text-[16px] font-bold mt-1">{countedItems.length}</div>
        </div>
        <div className="bg-card border border-border p-3 rounded-xl">
          <div className="text-[11px] text-muted-foreground font-semibold uppercase">Adjusted</div>
          <div className="text-[16px] font-bold mt-1 text-destructive">{adjustedItems.length}</div>
        </div>
      </div>

      {adjustedItems.length > 0 && (
        <div className="bg-card border border-border rounded-2xl divide-y divide-border mb-2">
          {adjustedItems.map(item => (
            <div key={item.id} className="p-4 flex items-center justify-between">
              <div>
                <div className="text-[14px] font-semibold text-foreground">{item.name}</div>
                <div className="text-[12px] text-muted-foreground/70">{item.sku}</div>
              </div>
              <div className="text-right">
                <div className="text-[14px] font-bold text-destructive">
                  {item.systemQty} → {item.countedQty}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {!(adjustedItems.length > 0) && (
        <div className="p-6 bg-card border border-border rounded-2xl mb-2 text-center text-[13px] text-muted-foreground">
          No items were adjusted. All counts matched the system.
        </div>
      )}
    </div>
  );
}
