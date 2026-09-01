"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PODetailsFields } from "./po-details-fields";
import { PODetailsSummaryBar } from "./po-details-summary-bar";
import { POItemBuilder } from "./po-item-builder";
import { formatCurrency } from "@/lib/utils";
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

interface PODesktopCreateViewProps {
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
  handleSaveDraft: () => void;
  detailsConfirmed: boolean;
  onContinue: () => void;
  setIsEditDetailsOpen: (open: boolean) => void;
}

/** Desktop full-screen takeover for creating a purchase order, same as the
 * Cycle Count session in stock-batch/stock-audits.tsx, so the ledger table
 * gets the whole viewport instead of being cramped inside the dashboard
 * shell. Mirrors POMobileCreateView's two-phase flow: order details are
 * confirmed first, then item entry becomes the dominant content, with
 * details editable via PODetailsDialog afterward. */
export function PODesktopCreateView(props: PODesktopCreateViewProps) {
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
    handleSaveDraft,
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
    <div className="hidden lg:flex fixed inset-0 z-50 flex-col bg-background">
      <div
        className="flex items-center gap-3 px-6 pb-5 border-b border-border bg-card shrink-0"
        style={{ paddingTop: "calc(var(--tauri-top, 0px) + 1.25rem)" }}
      >
        <div
          className="w-[38px] h-[38px] rounded-[10px] bg-muted flex items-center justify-center cursor-pointer text-muted-foreground shrink-0 hover:bg-muted/80 transition-colors"
          onClick={() => router.push("/procurement")}
        >
          <ArrowLeft className="w-[17px] h-[17px]" />
        </div>
        <div>
          <div className="text-[17px] font-serif font-bold leading-tight">
            Create Purchase Order
          </div>
          <div className="text-[12px] text-muted-foreground mt-0.5">
            {detailsConfirmed
              ? "Draft a formal request for stock batch replenishment"
              : "Enter the order details to continue"}
          </div>
        </div>
        {detailsConfirmed && (
          <div className="ml-auto flex items-center gap-4">
            <div className="text-right">
              <div className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wide">
                Estimated total
              </div>
              <div className="text-[15px] font-bold font-serif text-primary leading-tight">
                {formatCurrency(totalAmount)}
              </div>
            </div>
            {poType === "immediate" && (
              <Button
                variant="outline"
                className="h-10 px-5 rounded-[10px] text-[13px] font-bold"
                onClick={handleSaveDraft}
                disabled={isSubmitting || items.length === 0}
              >
                Save as Draft
              </Button>
            )}
            <Button
              className="h-10 px-5 rounded-[10px] text-[13px] font-bold"
              onClick={handleSubmit}
              disabled={isSubmitting || items.length === 0}
            >
              {isSubmitting
                ? "Saving..."
                : poType === "immediate"
                  ? "Save Purchase Order"
                  : "Save as Draft"}
            </Button>
          </div>
        )}
      </div>

      {detailsConfirmed ? (
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 bg-background/50">
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
      ) : (
        <div className="flex-1 overflow-y-auto flex flex-col">
          <div className="flex-1 flex justify-center p-6">
            <div className="w-full max-w-2xl">
              <PODetailsFields {...detailsFieldsProps} />
            </div>
          </div>
          <div className="border-t border-border bg-card p-4 flex justify-center shrink-0">
            <Button
              className="h-11 px-6 rounded-[10px] text-[13.5px] font-bold w-full max-w-2xl"
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
