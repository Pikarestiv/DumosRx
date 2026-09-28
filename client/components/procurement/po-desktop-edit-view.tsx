"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PODetailsSummaryBar } from "./po-details-summary-bar";
import { POItemBuilder } from "./po-item-builder";
import { getOrderTotal } from "./po-line-item-math";
import { formatCurrency } from "@/lib/utils";
import type { POProduct } from "@/lib/db/queries/procurement";
import type { POLineItemDraft } from "./po-item-ledger-table";
import type { ProductViewModel } from "@/lib/types/product";

interface PODesktopEditViewProps {
  poId: string | null;
  selectedSupplierName: string;
  poType: "standard" | "immediate";
  products: POProduct[];
  items: POLineItemDraft[];
  onItemsChange: (items: POLineItemDraft[]) => void;
  onOpenAddProduct: (productData: Partial<ProductViewModel>) => void;
  newlyCreatedProductId: string | null;
  onNewlyCreatedProductConsumed: () => void;
  isSubmitting: boolean;
  handleSubmit: () => void;
  onOpenEditDetails: () => void;
  paymentStatus?: string;
  dueDate?: string;
  amountPaid?: string;
}

/** Desktop full-screen takeover for editing an existing purchase order, the
 * counterpart to POMobileEditView. Extracted out of edit/page.tsx so both
 * views derive their "Estimated total" from the same getOrderTotal call the
 * rows below them use, and so the page can render only the active one. */
export function PODesktopEditView({
  poId,
  selectedSupplierName,
  poType,
  products,
  items,
  onItemsChange,
  onOpenAddProduct,
  newlyCreatedProductId,
  onNewlyCreatedProductConsumed,
  isSubmitting,
  handleSubmit,
  onOpenEditDetails,
  paymentStatus,
  dueDate,
  amountPaid,
}: PODesktopEditViewProps) {
  const router = useRouter();
  const totalAmount = getOrderTotal(items, poType);

  return (
    <div className="flex fixed inset-0 z-50 flex-col bg-background">
      <div
        className="flex items-center gap-3 px-6 pb-5 border-b border-border bg-card shrink-0"
        style={{ paddingTop: "calc(var(--tauri-top, 0px) + 1.25rem)" }}
      >
        <button
          type="button"
          aria-label="Back"
          className="w-[38px] h-[38px] rounded-[10px] bg-muted flex items-center justify-center cursor-pointer text-muted-foreground shrink-0 hover:bg-muted/80 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
          onClick={() => router.push("/procurement")}
        >
          <ArrowLeft className="w-[17px] h-[17px]" />
        </button>
        <div>
          <div className="text-[17px] font-serif font-bold leading-tight">
            Edit Purchase Order
          </div>
          <div className="text-[12px] text-muted-foreground mt-0.5">
            Modify draft or sent purchase order
          </div>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <div className="text-[12.5px] text-muted-foreground font-medium">
            PO-{poId ? poId.split("-")[0]?.toUpperCase() : ""} · {items.length} items
          </div>
          <div className="text-right">
            <div className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wide">
              Estimated total
            </div>
            <div className="text-[15px] font-bold font-serif text-primary leading-tight">
              {formatCurrency(totalAmount)}
            </div>
          </div>
          <Button
            className="h-10 px-5 rounded-[10px] text-[13px] font-bold"
            onClick={handleSubmit}
            disabled={isSubmitting || items.length === 0}
          >
            {isSubmitting ? "Saving..." : "Save Purchase Order"}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 bg-background/50">
        <PODetailsSummaryBar
          vendorName={selectedSupplierName}
          paymentStatus={paymentStatus}
          dueDate={dueDate}
          amountPaid={amountPaid}
          onEdit={onOpenEditDetails}
        />
        <POItemBuilder
          poType={poType}
          products={products}
          items={items}
          onItemsChange={onItemsChange}
          onOpenAddProduct={onOpenAddProduct}
          newlyCreatedProductId={newlyCreatedProductId}
          onNewlyCreatedProductConsumed={onNewlyCreatedProductConsumed}
        />
      </div>
    </div>
  );
}
