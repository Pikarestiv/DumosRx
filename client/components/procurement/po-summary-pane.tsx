"use client";

import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

interface POSummaryPaneProps {
  selectedSupplierName: string;
  totalAmount: number;
  onSave: () => void;
  isSubmitting: boolean;
  itemCount: number;
}

/** Desktop "Order Summary" right pane shared by the create and edit
 * purchase order pages. Items are now edited inline via POItemBuilder in
 * the left pane, so this only shows the running total/Save action, not a
 * duplicate read-only list. */
export function POSummaryPane({
  selectedSupplierName,
  totalAmount,
  onSave,
  isSubmitting,
  itemCount,
}: POSummaryPaneProps) {
  return (
    <div className="bg-card border-l border-border flex-col min-h-0 hidden md:flex">
      <div className="p-5 border-b border-border shrink-0">
        <div className="text-[14.5px] font-semibold text-foreground">
          Order Summary
        </div>
        <div className="text-[12px] text-muted-foreground mt-0.5 truncate">
          {selectedSupplierName}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 bg-muted/10 flex items-center justify-center text-[13px] text-muted-foreground">
        {itemCount} {itemCount === 1 ? "item" : "items"} added
      </div>
      <div className="p-5 border-t border-border shrink-0 bg-card">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Estimated total
          </div>
          <div className="text-[20px] font-bold font-serif text-primary">
            {formatCurrency(totalAmount)}
          </div>
        </div>
        <Button
          className="w-full h-12 rounded-xl text-[14px] font-bold"
          onClick={onSave}
          disabled={isSubmitting || itemCount === 0}
        >
          {isSubmitting ? "Creating..." : "Save Purchase Order"}
        </Button>
      </div>
    </div>
  );
}
