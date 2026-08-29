"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PODetailsFields } from "./po-details-fields";
import { PODetailsSummaryBar } from "./po-details-summary-bar";
import { POItemBuilder } from "./po-item-builder";
import { POMobileSummaryDrawer } from "./po-mobile-summary-drawer";
import type { ProductViewModel } from "@/lib/types/product";
import type { POProduct } from "@/lib/db/queries/procurement";
import type { POLineItemDraft } from "./po-item-ledger-table";

interface Supplier {
  id: string;
  name: string;
}

const PO_TYPE_LABEL = {
  immediate: "Immediate Purchase",
  standard: "Purchase Order",
} as const;

interface POMobileCreateViewProps {
  poType: "standard" | "immediate";
  setPoType: (type: "standard" | "immediate") => void;
  suppliers: Supplier[];
  selectedSupplierId: string;
  setSelectedSupplierId: (id: string) => void;
  selectedSupplierName: string;
  notes: string;
  setNotes: (notes: string) => void;
  paymentStatus: string;
  setPaymentStatus: (status: string) => void;
  dueDate: string;
  setDueDate: (date: string) => void;
  amountPaid: string;
  setAmountPaid: (amount: string) => void;
  totalAmount: number;
  products: POProduct[];
  onOpenAddProduct: (productData: Partial<ProductViewModel>) => void;
  newlyCreatedProductId: string | null;
  onNewlyCreatedProductConsumed: () => void;
  onOpenAddSupplier: () => void;
  items: POLineItemDraft[];
  onItemsChange: (items: POLineItemDraft[]) => void;
  isSubmitting: boolean;
  handleSubmit: () => void;
  detailsConfirmed: boolean;
  onContinue: () => void;
  setIsEditDetailsOpen: (open: boolean) => void;
}

/** Mobile full-screen takeover for creating a purchase order. Same
 * interaction model as POS: fixed header, scrollable form, and a floating
 * summary/save drawer instead of an always-visible footer. Mirrors the
 * desktop view's two-phase flow: order details are confirmed first, then
 * item entry becomes the dominant content, with details editable via
 * PODetailsDialog afterward. */
export function POMobileCreateView(props: POMobileCreateViewProps) {
  const {
    poType,
    setPoType,
    suppliers,
    selectedSupplierId,
    setSelectedSupplierId,
    selectedSupplierName,
    notes,
    setNotes,
    paymentStatus,
    setPaymentStatus,
    dueDate,
    setDueDate,
    amountPaid,
    setAmountPaid,
    totalAmount,
    products,
    onOpenAddProduct,
    newlyCreatedProductId,
    onNewlyCreatedProductConsumed,
    onOpenAddSupplier,
    items,
    onItemsChange,
    isSubmitting,
    handleSubmit,
    detailsConfirmed,
    onContinue,
    setIsEditDetailsOpen,
  } = props;

  const router = useRouter();

  const detailsFieldsProps = {
    poType,
    setPoType,
    suppliers,
    selectedSupplierId,
    setSelectedSupplierId,
    notes,
    setNotes,
    paymentStatus,
    setPaymentStatus,
    dueDate,
    setDueDate,
    amountPaid,
    setAmountPaid,
    totalAmount,
    onOpenAddSupplier,
  };

  return (
    <div
      className="lg:hidden fixed inset-0 z-40 bg-background flex flex-col"
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
            Create Purchase Order
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {detailsConfirmed
              ? `Draft · ${items.length} ${items.length === 1 ? "item" : "items"}`
              : "Enter the order details to continue"}
          </div>
        </div>
        {detailsConfirmed && (
          <Button
            size="sm"
            className="ml-auto h-9 px-4 rounded-[10px] text-[12.5px] font-semibold shrink-0"
            onClick={handleSubmit}
            disabled={isSubmitting || items.length === 0}
          >
            {isSubmitting ? "Saving..." : poType === "immediate" ? "Save" : "Save Draft"}
          </Button>
        )}
      </div>

      {detailsConfirmed ? (
        <>
          <div
            className="flex-1 overflow-y-auto px-4 pt-4 flex flex-col gap-3.5"
            style={{
              paddingBottom:
                "calc(7rem + var(--tauri-bottom, env(safe-area-inset-bottom, 0px)))",
            }}
          >
            <PODetailsSummaryBar
              vendorName={selectedSupplierName}
              poTypeLabel={PO_TYPE_LABEL[poType]}
              onEdit={() => setIsEditDetailsOpen(true)}
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

          <POMobileSummaryDrawer
            itemCount={items.length}
            totalAmount={totalAmount}
            selectedSupplierName={selectedSupplierName}
            lineItems={items.map((item) => ({
              productName: item.product_name,
              quantity: item.bulk_quantity,
              bulkUnit: item.bulk_unit,
              lineTotal:
                item.bulk_quantity *
                (poType === "immediate" &&
                item.cost_price_override !== undefined &&
                item.cost_price_override !== ""
                  ? Number(item.cost_price_override)
                  : item.unit_cost),
            }))}
          />
        </>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-4 pt-4">
            <PODetailsFields {...detailsFieldsProps} />
          </div>
          <div className="border-t border-border bg-card p-4 shrink-0">
            <Button
              className="w-full h-11 rounded-[10px] text-[13.5px] font-bold"
              onClick={onContinue}
            >
              Continue to Add Items
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
