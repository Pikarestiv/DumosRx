"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StoreType } from "@/lib/context/store-context";
import { POOrderFormFields } from "./po-order-form-fields";
import { POMobileSummaryDrawer } from "./po-mobile-summary-drawer";
import type { Product } from "@/lib/types/product";

interface Supplier {
  id: string;
  name: string;
}

interface POMobileCreateViewProps {
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
  products: Product[];
  onAddLineItem: (item: any) => void;
  onOpenAddProduct: (productData: any) => void;
  newlyCreatedProductId: string | null;
  onNewlyCreatedProductConsumed: () => void;
  onOpenAddSupplier: () => void;
  items: any[];
  removeLineItem: (index: number) => void;
  storeType: StoreType;
  isSubmitting: boolean;
  handleSubmit: () => void;
}

/** Mobile full-screen takeover for creating a purchase order — same
 * interaction model as POS: fixed header, scrollable form, and a floating
 * summary/save drawer instead of an always-visible footer. */
export function POMobileCreateView(props: POMobileCreateViewProps) {
  const {
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
    onAddLineItem,
    onOpenAddProduct,
    newlyCreatedProductId,
    onNewlyCreatedProductConsumed,
    onOpenAddSupplier,
    items,
    removeLineItem,
    storeType,
    isSubmitting,
    handleSubmit,
  } = props;

  const router = useRouter();

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
            Draft · {items.length} {items.length === 1 ? "item" : "items"}
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
        <POOrderFormFields
          suppliers={suppliers}
          selectedSupplierId={selectedSupplierId}
          setSelectedSupplierId={setSelectedSupplierId}
          notes={notes}
          setNotes={setNotes}
          paymentStatus={paymentStatus}
          setPaymentStatus={setPaymentStatus}
          dueDate={dueDate}
          setDueDate={setDueDate}
          amountPaid={amountPaid}
          setAmountPaid={setAmountPaid}
          totalAmount={totalAmount}
          products={products}
          onAddLineItem={onAddLineItem}
          onOpenAddProduct={onOpenAddProduct}
          newlyCreatedProductId={newlyCreatedProductId}
          onNewlyCreatedProductConsumed={onNewlyCreatedProductConsumed}
          onOpenAddSupplier={onOpenAddSupplier}
        />
      </div>

      <POMobileSummaryDrawer
        items={items}
        totalAmount={totalAmount}
        selectedSupplierName={selectedSupplierName}
        storeType={storeType}
        onRemoveItem={removeLineItem}
        onSave={handleSubmit}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
