"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PODetailsSummaryBar } from "./po-details-summary-bar";
import { POItemBuilder } from "./po-item-builder";
import { POMobileSummaryDrawer } from "./po-mobile-summary-drawer";
import type { POProduct } from "@/lib/db/queries/procurement";
import type { POLineItemDraft } from "./po-item-ledger-table";
import type { ProductViewModel } from "@/lib/types/product";

interface POMobileEditViewProps {
  poId: string | null;
  selectedSupplierName: string;
  totalAmount: number;
  products: POProduct[];
  items: POLineItemDraft[];
  onItemsChange: (items: POLineItemDraft[]) => void;
  onOpenAddProduct: (productData: Partial<ProductViewModel>) => void;
  newlyCreatedProductId: string | null;
  onNewlyCreatedProductConsumed: () => void;
  isSubmitting: boolean;
  handleSubmit: () => void;
  onOpenEditDetails: () => void;
}

/** Mobile full-screen takeover for editing an existing purchase order.
 * Mirrors POMobileCreateView's layout, minus the two-phase details flow
 * (an existing PO's details are always already set), so the item builder
 * is the dominant content from the start. */
export function POMobileEditView({
  poId,
  selectedSupplierName,
  totalAmount,
  products,
  items,
  onItemsChange,
  onOpenAddProduct,
  newlyCreatedProductId,
  onNewlyCreatedProductConsumed,
  isSubmitting,
  handleSubmit,
  onOpenEditDetails,
}: POMobileEditViewProps) {
  const router = useRouter();

  return (
    <div
      className="lg:hidden fixed inset-0 z-50 bg-background flex flex-col"
      style={{ height: "100dvh" }}
    >
      <div
        className="flex items-center gap-3 px-4 border-b border-border bg-card shrink-0"
        style={{
          paddingTop:
            "calc(var(--tauri-top, env(safe-area-inset-top, 0px)) + 1.25rem)",
          paddingBottom: "0.75rem",
        }}
      >
        <div
          className="w-[38px] h-[38px] rounded-[10px] bg-muted flex items-center justify-center cursor-pointer text-muted-foreground shrink-0 hover:bg-muted/80 transition-colors"
          onClick={() => router.push("/procurement")}
        >
          <ArrowLeft className="w-[17px] h-[17px]" />
        </div>
        <div className="min-w-0">
          <div className="text-[15px] font-serif font-bold leading-tight">
            Edit Purchase Order
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
            PO-{poId ? poId.split("-")[0]?.toUpperCase() : ""} ·{" "}
            {items.length} {items.length === 1 ? "item" : "items"}
          </div>
        </div>
        <Button
          size="sm"
          className="ml-auto h-9 px-4 rounded-[10px] text-[12.5px] font-semibold shrink-0"
          onClick={handleSubmit}
          disabled={isSubmitting || items.length === 0}
        >
          {isSubmitting ? "Saving..." : "Save"}
        </Button>
      </div>

      <div
        className="flex-1 overflow-y-auto px-4 pt-4 flex flex-col gap-3.5"
        style={{
          paddingBottom:
            "calc(7rem + var(--tauri-bottom, env(safe-area-inset-bottom, 0px)))",
        }}
      >
        <PODetailsSummaryBar
          vendorName={selectedSupplierName}
          onEdit={onOpenEditDetails}
        />
        <POItemBuilder
          poType="standard"
          products={products}
          items={items}
          onItemsChange={onItemsChange}
          onOpenAddProduct={onOpenAddProduct}
          newlyCreatedProductId={newlyCreatedProductId}
          onNewlyCreatedProductConsumed={onNewlyCreatedProductConsumed}
        />
      </div>

      <POMobileSummaryDrawer
        itemCount={items.length}
        totalAmount={totalAmount}
        selectedSupplierName={selectedSupplierName}
        lineItems={items.map((item) => ({
          productName: item.product_name,
          quantity: item.bulk_quantity,
          bulkUnit: item.bulk_unit,
          lineTotal: item.bulk_quantity * item.unit_cost,
        }))}
      />
    </div>
  );
}
