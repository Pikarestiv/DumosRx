"use client";

import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PODetailsSummaryBarProps {
  vendorName: string;
  /** Omitted entirely on the edit page, where every PO is Standard and a
   * type badge would be redundant with the page's own "Edit Purchase
   * Order" title. */
  poTypeLabel?: string;
  onEdit: () => void;
}

/** Compact stand-in for the full details form once it's been confirmed:
 * shows just enough to orient the user (vendor, type) plus a way back into
 * PODetailsFields via PODetailsDialog, so item entry can be the dominant
 * content on screen instead of competing with the form above it. */
export function PODetailsSummaryBar({
  vendorName,
  poTypeLabel,
  onEdit,
}: PODetailsSummaryBarProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-border rounded-xl bg-card px-4 py-3 shadow-sm">
      <div className="min-w-0 space-y-1">
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Vendor
        </div>
        <div className="text-[14px] font-semibold text-foreground break-words sm:truncate">
          {vendorName}
        </div>
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        {poTypeLabel && (
          <span className="shrink-0 inline-flex items-center rounded-full bg-primary/10 text-primary px-2.5 py-1 text-[11px] font-semibold">
            {poTypeLabel}
          </span>
        )}
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          title="Edit details"
          onClick={onEdit}
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
